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
  WorkflowContext, 
  WorkflowRunner 
} from '@ai-crew-suite/plugin-kernel-node';
import type { RfcAdrReviewerConfig } from '../config';
import { reviewArchitecture } from '../nodes/seniorArchitect';
import { reviewSecurity } from '../nodes/securityLead';
import { createDesignCritiqueArtifactEvent } from '../services/CritiqueArtifactWriter';
import { ReviewToolRunner } from '../services/ReviewToolRunner';
import { buildDesignCritique } from './critique';
import { extractReferences, redactDocument } from './document';
import { parseReviewQuery, ReviewRequestValidationError } from './request';

/** Stable custom workflow identifier for RFC/ADR review. */
export const RFC_ADR_REVIEW_WORKFLOW_ID = 'rfc-adr-review';

/** Configurable limits for the custom parallel review runner. */
export type ReviewGraphOptions = Pick<
  RfcAdrReviewerConfig,
  'maxDocumentCharacters' | 'maxFindings' | 'maxToolInvocations' | 'publish'
>;

/**
 * Executes independent architecture and security channels concurrently, 
 * then compiles a unified critique artifact tracking citations and limitations.
 */
export class ReviewGraph implements WorkflowRunner {
  readonly id = RFC_ADR_REVIEW_WORKFLOW_ID;

  /**
   * Creates an instance of ReviewGraph.
   *
   * @param options - Configuration constraints injected during module setup.
   */
  constructor(private readonly options: ReviewGraphOptions) {}

  /**
   * Main runtime handler processing the file reading, parallel node evaluations, and final output wrapping.
   *
   * @param input - Incoming session tracking descriptors and parameters.
   * @param context - Shared environment framework utilities and system contract handlers.
   * @returns An asynchronous generator yielding progressive streaming state events.
   */
  async *run(input: AgentRunInput, context: WorkflowContext): AsyncIterable<AgentEvent> {
    let seq = 0;
    const step = (node: string, phase: 'enter' | 'exit'): AgentEvent => ({
      type: 'step',
      data: { runId: input.runId, seq: ++seq, node, phase },
    });

    yield step('document.read', 'enter');
    let request;

    try {
      request = parseReviewQuery(input.input.query, input.trigger ? 'events' : 'manual');
    } catch (error) {
      const message =
        error instanceof ReviewRequestValidationError || error instanceof Error
          ? error.message
          : String(error);

      yield { type: 'error', data: { runId: input.runId, message } };
      return;
    }

    const tools = new ReviewToolRunner(context, this.options.maxToolInvocations);

    yield {
      type: 'tool_call',
      data: {
        runId: input.runId,
        tool: 'vcs.repository.read_file',
        args: { repoUrl: request.repoUrl, path: request.path, ref: request.ref },
      },
    };

    const documentResult = await tools.invoke<
      { repoUrl: string; path: string; ref?: string },
      { content?: string }
    >('vcs.repository.read_file', {
      repoUrl: request.repoUrl,
      path: request.path,
      ref: request.ref,
    });

    yield {
      type: 'tool_result',
      data: {
        runId: input.runId,
        tool: 'vcs.repository.read_file',
        ok: Boolean(documentResult),
        summary: documentResult?.summary,
      },
    };

    const rawDocument = documentResult?.output.content ?? '';
    const document = redactDocument(rawDocument).slice(0, this.options.maxDocumentCharacters);

    if (!document) {
      yield {
        type: 'error',
        data: { runId: input.runId, message: 'RFC/ADR document could not be read.' },
      };
      return;
    }

    yield step('document.read', 'exit');

    const documentEvidence = [
      {
        id: 'document-1',
        source: 'document' as const,
        summary: `RFC/ADR document ${request.path}`,
        reference: request.path,
      },
    ];

    yield step('senior-architect', 'enter');
    yield step('security-lead', 'enter');

    const [architecture, security] = await Promise.all([
      reviewArchitecture({
        request,
        document,
        references: extractReferences(document),
        tools,
      }),
      reviewSecurity({ request, document, tools }),
    ]);

    yield step('senior-architect', 'exit');
    yield step('security-lead', 'exit');

    yield step('compilation', 'enter');
    const limitations = [...tools.limitations];

    if (this.options.publish.enabled) {
      limitations.push(
        'PR commenting is disabled: the shared vcs.pull_request.comment write tool is not registered.'
      );
    }
    limitations.push(
      'Catalog entity validation is unavailable until the shared CatalogEntityResolver contract is registered.'
    );

    const critique = buildDesignCritique({
      request,
      findings: [...architecture.findings, ...security.findings],
      evidence: [...documentEvidence, ...architecture.evidence, ...security.evidence],
      limitations,
      maxFindings: this.options.maxFindings,
    });

    yield step('compilation', 'exit');
    yield createDesignCritiqueArtifactEvent(input.runId, critique);

    yield { type: 'done', data: { runId: input.runId } };
  }
}
