/*
 * Copyright 2024 Larder Software Limited
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

import { trace, type Span } from '@opentelemetry/api';
import type {
  AgentDefinition,
  AgentEvent,
  AgentRunInput,
  ApprovalDecision,
  RunContext,
} from '@ai-crew-suite/plugin-kernel-node';
import type { GraphExecutor } from './GraphExecutor';
import { ToolExecutor } from './ToolExecutor';
import { ModelExecutor } from './ModelExecutor';

type RuntimeContext = Omit<RunContext, 'model' | 'systemPrompt'> & {
  model: unknown;
  systemPrompt?: string;
};

type RunProcessingState = { seq: number; totalUsage: number };

/**
 * Lifecycle-only runtime for AI Core. Resolves agents to workflow definitions,
 * creates run records, owns the retry loop, and pipes GraphExecutor events
 * through persistence (run steps, artifacts, audit, usage). Sequencing and
 * orchestration mechanics live in GraphExecutor.
 */
export class AgentRuntime {
  constructor(
    private readonly agents: Map<string, AgentDefinition>,
    private readonly executor: GraphExecutor,
  ) {}

  /**
   * Executes a new run and streams normalized agent events to callers.
   */
  async *run(input: AgentRunInput, ctx: RuntimeContext): AsyncIterable<AgentEvent> {
    const agent = this.agents.get(input.agentId);
    const runId = input.runId;

    if (!agent) {
      ctx.logger.warn(`Run '${runId}' requested unknown agent '${input.agentId}'`);

      yield {
        type: 'error',
        data: {
          runId,
          code: 'invalid_input',
          retryable: false,
          message: `Unknown agent '${input.agentId}'`,
        },
      };

      return;
    }

    if (!agent.workflowRef) {
      ctx.logger.warn(`Run '${runId}' agent '${input.agentId}' has no workflowRef`);

      yield {
        type: 'error',
        data: {
          runId,
          code: 'invalid_input',
          retryable: false,
          message: `Agent '${input.agentId}' has no workflowRef`
        }
      };

      return;
    }

    const runSpan = trace.getTracer('plugin-ai-core-backend').startSpan(
      'ai.run',
      {
        attributes: { 'ai.run.id': runId, 'ai.agent.id': input.agentId },
      }
    );

    await this.createRunRecord(input, ctx);

    const maxRetries = Math.max(0, ctx.hardening?.maxRetries ?? 0);
    const retryBackoffMs = Math.max(50, ctx.hardening?.retryBackoffMs ?? 250);

    const state: RunProcessingState = { seq: 0, totalUsage: 0 };

    let attempt = 0;

    while (attempt <= maxRetries) {
      const cancelled = await this.cancelIfAborted(runId, state, ctx);

      if (cancelled) {
        yield cancelled;
        return;
      }

      try {
        const runContext = this.createRunContext(ctx, agent);

        const events = this.executor.run(
          agent,
          {
            runId: input.runId,
            query: input.input.query,
            source: input.input.source,
            entityFilter: input.input.entityFilter,
            sessionId: input.input.sessionId,
          },
          runContext
        );

        for await (const event of events) {
          const budgetError = await this.processRunEvent(input, ctx, event, state, runSpan);

          yield event;

          if (budgetError) {
            yield budgetError;
            return;
          }
        }

        runSpan.end();

        return;

      } catch (error) {
        const isLastAttempt = attempt >= maxRetries;

        if (isLastAttempt) {
          const failedEvent = await this.failRun(runId, state, ctx, error);

          yield failedEvent;

          runSpan.end();

          return;
        }

        const backoffMs = retryBackoffMs * 2 ** attempt;

        ctx.logger.warn(
          `Run '${runId}' attempt ${attempt + 1} failed; retrying in ${backoffMs}ms: ${(error as Error)?.message ?? 'Unknown error'}`
        );

        await this.sleep(backoffMs);

        attempt += 1;
      }
    }
  }

  /**
   * Resumes a paused run after an approval decision.
   */
  async *resume(
    runId: string,
    _decision: ApprovalDecision,
    _ctx: RuntimeContext,
  ): AsyncIterable<AgentEvent> {
    yield { type: 'done', data: { runId } };
  }

  private createRunContext(_ctx: RuntimeContext, _agent: AgentDefinition): {
    toolExecutorFactory: (nodeName: string) => ToolExecutor;
    modelExecutorFactory: () => ModelExecutor;
    checkpointStore?: unknown;
  } {
    return {
      toolExecutorFactory: (_nodeName) => ({
        invoke: async () => ({ toolId: _nodeName, output: {}, summary: '' })
      } as unknown as ToolExecutor),

      modelExecutorFactory: () => ({
        invoke: async () => '',
        stream: async function* () {},
        forTier() { return this; }
      } as unknown as ModelExecutor),

      checkpointStore: undefined,
    };
  }

  private async createRunRecord(input: AgentRunInput, ctx: RuntimeContext): Promise<void> {
    await ctx.runStore?.createRun({
      id: input.runId,
      agentId: input.agentId,
      sessionId: input.input.sessionId,
      status: 'running',
      trigger: input.trigger,
      idempotencyKey: input.idempotencyKey,
      actorIdentity: '', // @TODO: Implement Me
      createdAt: new Date().toISOString(),
    });
  }

  private async cancelIfAborted(_runId: string, _state: RunProcessingState, _ctx: RuntimeContext): Promise<AgentEvent | undefined> {
    return undefined;
  }

  private async processRunEvent(
    _input: AgentRunInput,
    ctx: RuntimeContext,
    event: AgentEvent,
    state: RunProcessingState,
    runSpan: Span,
  ): Promise<AgentEvent | undefined> {
    runSpan.setAttribute('ai.usage.input', event.type === 'usage' ? event.data.input : 0);
    if (event.type === 'usage') {
      state.totalUsage += event.data.total;
    }
    if (event.type === 'done' || event.type === 'error') {
      await ctx.runStore?.updateRunStatus(event.data.runId, event.type === 'done' ? 'done' : 'error');
    }
    return undefined;
  }

  private async failRun(runId: string, _state: RunProcessingState, ctx: RuntimeContext, error: unknown): Promise<AgentEvent> {
    await ctx.runStore?.updateRunStatus(runId, 'error');
    return { type: 'error', data: { runId, code: 'unknown', retryable: false, message: error instanceof Error ? error.message : String(error) } };
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
