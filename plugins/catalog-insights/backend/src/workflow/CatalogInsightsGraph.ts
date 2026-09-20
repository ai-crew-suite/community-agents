/*
 * Copyright 2026 The AI Crew Suite Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import type {
  AgentEvent,
  AgentRunInput,
  CatalogEntityResolver,
  CatalogIntegrationReferences,
  WorkflowContext,
  WorkflowRunner,
} from '@ai-crew-suite/plugin-kernel-node';
import { InsightRetriever } from '../retrieval/InsightRetriever';
import { buildInsightPrompt } from '../retrieval/promptContext';
import { createInsightReportArtifactEvent } from '../services/InsightArtifactWriter';
import { InsightToolRunner } from '../services/InsightToolRunner';
import {
  normalizeContext,
  redactSensitiveText,
  type RawContextItem,
} from './context';
import { gatherForIntent } from './gather';
import {
  buildCatalogInsightReport,
  parseModelInsight,
  type ModelInsightSynthesis,
} from './insight';
import { INTENT_TOOL_PLANS, classifyIntent } from './intents';
import { InsightRequestValidationError, parseInsightQuery } from './request';
import type {
  CatalogInsightRequest,
  CatalogInsightReport,
  InsightRunState,
} from './state';

/** Stable workflow identifier for the catalog insights graph. */
export const CATALOG_INSIGHTS_WORKFLOW_ID = 'catalog-insights';

/**
 * Construction options for `CatalogInsightsGraph`, derived from the module
 * config and overridable for tests.
 */
export type CatalogInsightsGraphOptions = {
  /** Shared catalog semantic resolver used to validate and describe the target entity. */
  resolver: CatalogEntityResolver;
  /** Maximum context items retained for the report. Defaults to 24. */
  maxContextItems?: number;
  /** Maximum knowledge-retrieval chunks attached per run. Defaults to 6. */
  maxRetrievalChunks?: number;
  /** Maximum log-search results retained for observability answers. Defaults to 5. */
  maxLogResults?: number;
  /** Hard cap on tool invocations per run. Defaults to 10. */
  maxToolInvocations?: number;
  /** Minutes of context gathered for deployment-health questions. Defaults to 1440. */
  lookbackMinutes?: number;
  /** Per-tool timeout in milliseconds. Defaults to 10_000. */
  toolTimeoutMs?: number;
  /** Injectable clock for deterministic tests. */
  now?: () => Date;
};

const invokeModel = async (
  context: WorkflowContext,
  prompt: string,
): Promise<string> => {
  const result = await context.model.invoke(prompt);
  if (typeof result === 'string') {
    return result;
  }
  const content = (result as { content?: unknown }).content;
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map(part => {
        if (typeof part === 'string') {
          return part;
        }
        const text = (part as { text?: unknown })?.text;
        return typeof text === 'string' ? (part as { text: string }).text : '';
      })
      .join('');
  }
  return String(result);
};

/**
 * Read-only, intent-routed catalog insight graph.
 *
 * The graph owns question-intent routing, per-intent tool-gathering policy,
 * context normalization, and report interpretation. AI Core centrally owns
 * tool allow-list enforcement, bounded execution, identity propagation, run
 * persistence, and auditing. The configured model only synthesizes a cited
 * answer from the normalized, redacted context bundle; it never selects tools
 * or intents.
 */
export class CatalogInsightsGraph implements WorkflowRunner {
  readonly id = CATALOG_INSIGHTS_WORKFLOW_ID;

  constructor(private readonly options: CatalogInsightsGraphOptions) {}
  async *run(
    input: AgentRunInput,
    context: WorkflowContext,
  ): AsyncIterable<AgentEvent> {
    const now = this.options.now ?? (() => new Date());
    let seq = 0;
    const step = (node: string, phase: 'enter' | 'exit'): AgentEvent => ({
      type: 'step',
      data: { runId: input.runId, seq: ++seq, node, phase },
    });

    const tools = new InsightToolRunner(context, {
      maxInvocations: this.options.maxToolInvocations ?? 10,
      timeoutMs: this.options.toolTimeoutMs ?? 10_000,
    });
    const retriever = new InsightRetriever(context, {
      maxChunks: this.options.maxRetrievalChunks ?? 6,
    });

    // Node: request.validate
    yield step('request.validate', 'enter');
    let request: CatalogInsightRequest;
    try {
      request = parseInsightQuery(input.input.query, {
        defaultSource: input.trigger ? 'scheduler' : 'manual',
      });
    } catch (error) {
      if (error instanceof InsightRequestValidationError) {
        yield {
          type: 'error',
          data: { runId: input.runId, message: error.message },
        };
        return;
      }
      throw error;
    }

    let entity;
    try {
      entity = await this.options.resolver.getEntitySummary(request.entityRef);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      yield {
        type: 'error',
        data: {
          runId: input.runId,
          message: `Catalog lookup failed for '${request.entityRef}': ${message}`,
        },
      };
      return;
    }
    if (!entity) {
      yield {
        type: 'error',
        data: {
          runId: input.runId,
          message: `Catalog entity '${request.entityRef}' was not found or is not readable.`,
        },
      };
      return;
    }

    const raw: RawContextItem[] = [
      {
        id: `catalog:entity:${entity.ref}`,
        source: 'catalog',
        kind: 'entity-summary',
        summary:
          `${entity.kind} ${entity.name} (${entity.title ?? entity.name})` +
          `${entity.type ? `, type=${entity.type}` : ''}` +
          `${entity.lifecycle ? `, lifecycle=${entity.lifecycle}` : ''}` +
          `${entity.owner ? `, owner=${entity.owner}` : ''}` +
          `${entity.description ? `: ${entity.description}` : ''}`,
        reference: `/catalog/${entity.namespace}/${entity.kind.toLowerCase()}/${entity.name}`,
      },
    ];
    const state: InsightRunState = {
      request,
      entity,
      context: [],
      limitations: [],
    };
    yield step('request.validate', 'exit');

    // Node: intent.classify
    yield step('intent.classify', 'enter');
    const intent = classifyIntent(request.question, request.intentHint);
    state.intent = intent;
    yield step('intent.classify', 'exit');

    // Node: context.gather
    yield step('context.gather', 'enter');
    const references = await this.integrationReferences(request.entityRef, state);
    yield* gatherForIntent({
      runId: input.runId,
      state,
      intent,
      plan: INTENT_TOOL_PLANS[intent],
      references,
      raw,
      tools,
      now,
      lookbackMinutes: this.options.lookbackMinutes ?? 1_440,
      maxLogResults: this.options.maxLogResults ?? 5,
    });
    yield step('context.gather', 'exit');

    // Node: context.retrieve (the only RAG entry point; runs for every intent)
    yield step('context.retrieve', 'enter');
    yield {
      type: 'tool_call',
      data: {
        runId: input.runId,
        tool: 'knowledge.retrieve',
        args: { query: request.question, entityRef: request.entityRef },
      },
    };
    const retrieved = await retriever.retrieve({
      request,
      entityName: entity.name,
      entityType: entity.type,
    });
    raw.push(...retrieved);
    yield {
      type: 'tool_result',
      data: {
        runId: input.runId,
        tool: 'knowledge.retrieve',
        ok: true,
        summary: `${retrieved.length} documentation chunk(s) retrieved`,
      },
    };
    yield step('context.retrieve', 'exit');

    // Node: context.normalize
    yield step('context.normalize', 'enter');
    const normalized = normalizeContext(raw, {
      maxItems: this.options.maxContextItems ?? 24,
    });
    if (normalized.dropped > 0) {
      state.limitations.push(
        `Context bundle was capped: ${normalized.dropped} item(s) dropped to respect the configured limit.`,
      );
    }
    state.context = normalized.context;
    state.limitations.push(...tools.limitations);
    yield step('context.normalize', 'exit');

    // Node: insight.synthesize
    yield step('insight.synthesize', 'enter');
    const synthesis = yield* this.synthesize(context, state);
    yield step('insight.synthesize', 'exit');

    // Node: insight.finalize
    yield step('insight.finalize', 'enter');
    const report: CatalogInsightReport = buildCatalogInsightReport({
      request,
      intent,
      context: state.context,
      synthesis,
      limitations: state.limitations,
    });
    yield createInsightReportArtifactEvent(input.runId, report);
    yield step('insight.finalize', 'exit');
    yield {
      type: 'done',
      data: { runId: input.runId, sessionId: input.input.sessionId },
    };
  }

  /**
   * Loads integration references for annotation-based gating. Failures are
   * non-fatal: gathering falls back to attempting the tool calls, which
   * degrade to limitations when the underlying drivers are absent.
   */
  private async integrationReferences(
    entityRef: string,
    state: InsightRunState,
  ): Promise<CatalogIntegrationReferences | undefined> {
    try {
      return await this.options.resolver.getIntegrationReferences(entityRef);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      state.limitations.push(
        `Integration reference lookup failed: ${message}`,
      );
      return undefined;
    }
  }

  /**
   * Runs model synthesis over the normalized context bundle. Any failure or
   * schema/citation violation degrades gracefully to a deterministic answer
   * and is recorded as a report limitation.
   */
  private async *synthesize(
    context: WorkflowContext,
    state: InsightRunState,
  ): AsyncGenerator<AgentEvent, ModelInsightSynthesis | undefined> {
    if (state.context.length === 0) {
      state.limitations.push(
        'Insufficient context: nothing was gathered, so no answer could be supported.',
      );
      return undefined;
    }

    const prompt = buildInsightPrompt({
      systemPrompt: context.agent.systemPrompt,
      request: state.request,
      entity: state.entity as NonNullable<InsightRunState['entity']>,
      context: state.context,
    });

    let rawModelOutput: string;
    try {
      rawModelOutput = redactSensitiveText(await invokeModel(context, prompt));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      context.logger.warn('Model synthesis failed; using deterministic answer', {
        error: message,
      });
      state.limitations.push(`Model synthesis unavailable: ${message}`);
      return undefined;
    }

    const synthesis = parseModelInsight(
      rawModelOutput,
      new Set(state.context.map(item => item.id)),
    );
    if (!synthesis) {
      state.limitations.push(
        'Model output did not satisfy the report schema; a deterministic answer was used instead.',
      );
      return undefined;
    }
    state.limitations.push(...synthesis.limitations);
    return synthesis;
  }
}

