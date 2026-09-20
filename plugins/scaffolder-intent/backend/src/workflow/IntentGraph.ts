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
  WorkflowRunner,
} from '@ai-crew-suite/plugin-kernel-node';
import type { ScaffolderIntentConfig } from '../config';
import { intentProposalArtifact } from '../services/IntentArtifactWriter';
import { NameAvailabilityChecker } from '../services/NameAvailabilityChecker';
import { TemplateResolver } from '../services/TemplateResolver';
import { coerceParameters } from './coerce';
import { IntentRequestValidationError, parseIntentQuery } from './parse';
import { selectTemplates } from './select';
import type { ScaffolderIntentProposal, ValidationIssue } from './state';

/** Stable workflow identifier for schema-grounded template intent proposals. */
export const SCAFFOLDER_INTENT_WORKFLOW_ID = 'scaffolder-intent';

/** Produces a read-only proposal; confirmation/session/task execution are intentionally deferred. */
export class IntentGraph implements WorkflowRunner {
  readonly id = SCAFFOLDER_INTENT_WORKFLOW_ID;

  constructor(
    private readonly config: ScaffolderIntentConfig,
    private readonly templates: TemplateResolver,
    private readonly names: NameAvailabilityChecker,
  ) {}

  async *run(
    input: AgentRunInput,
    _context: WorkflowContext,
  ): AsyncIterable<AgentEvent> {
    let parsed;

    try {
      parsed = parseIntentQuery(
        input.input.query,
        this.config.maxUtteranceChars,
      );
    } catch (error) {
      yield {
        type: 'error',
        data: {
          runId: input.runId,
          message:
            error instanceof IntentRequestValidationError ||
            error instanceof Error
              ? error.message
              : String(error),
        },
      };

      return;
    }

    let seq = 0;

    const step = (node: string, phase: 'enter' | 'exit'): AgentEvent => ({
      type: 'step',
      data: { runId: input.runId, seq: ++seq, node, phase },
    });

    yield step('select', 'enter');

    const candidates = selectTemplates(
      parsed.facts,
      this.config.allowedTemplates,
    );

    const selected = candidates[0];

    if (!selected || selected.score < this.config.minSelectionScore) {
      yield intentProposalArtifact(input.runId, {
        utterance: parsed.request.utterance,
        sessionId: input.input.sessionId ?? input.runId,
        status: parsed.facts.kind ? 'no_template_match' : 'unparseable',
        candidates,
        confidence: 'low',
        parameters: [],
        issues: [],
        turns: 0,
        limitations: [
          'Only configured allow-listed templates can be selected.',
        ],
        evidence: [],
      });

      yield { type: 'done', data: { runId: input.runId } };

      return;
    }

    yield step('select', 'exit');
    yield step('coerce', 'enter');

    let schema;

    try {
      schema = await this.templates.resolve(selected.templateRef);
    } catch (error) {
      yield intentProposalArtifact(input.runId, {
        utterance: parsed.request.utterance,
        sessionId: input.input.sessionId ?? input.runId,
        status: 'no_template_match',
        candidates,
        confidence: 'low',
        parameters: [],
        issues: [],
        turns: 0,
        limitations: [error instanceof Error ? error.message : String(error)],
        evidence: [],
      });

      yield { type: 'done', data: { runId: input.runId } };

      return;
    }
    if (!schema) {
      yield {
        type: 'error',
        data: {
          runId: input.runId,
          message: 'Selected template is not allow-listed.',
        },
      };

      return;
    }

    const coerced = coerceParameters(parsed.facts, schema);

    yield step('coerce', 'exit');

    const issues: ValidationIssue[] = [...coerced.issues];

    yield step('validate', 'enter');

    const name = coerced.parameters.find(
      parameter => parameter.field.toLowerCase().includes('name'),
    )?.value;

    if (
      this.config.checkCatalogName &&
      typeof name === 'string' &&
      !(await this.names.isAvailable(name))
    )
      issues.push({
        id: `iss-${issues.length + 1}`,
        field: 'name',
        kind: 'name_taken',
        message: `Component name '${name}' is already taken.`,
        blocking: true,
        question: `${name} is already taken — what name should I use instead?`,
        evidence: ['cat-1'],
      });

    yield step('validate', 'exit');

    const proposal: ScaffolderIntentProposal = {
      utterance: parsed.request.utterance,
      sessionId: input.input.sessionId ?? input.runId,
      status: issues.some(issue => issue.blocking)
        ? 'awaiting_correction'
        : 'proposed',
      selectedTemplate: selected.templateRef,
      candidates,
      confidence: issues.length ? 'low' : 'high',
      parameters: coerced.parameters,
      issues,
      turns: 0,
      limitations: [
        'Correction turns, confirmation, and task execution are not active in this proposal-only milestone.',
      ],
      evidence: [
        {
          id: selected.evidence[0],
          source: 'template',
          summary: `Selected allow-listed template ${selected.templateRef}`,
          reference: selected.templateRef,
        },
        ...(issues.some(issue => issue.kind === 'name_taken')
          ? [
              {
                id: 'cat-1',
                source: 'catalog' as const,
                summary: 'Catalog component-name collision check',
              },
            ]
          : []),
      ],
    };

    yield intentProposalArtifact(input.runId, proposal);
    yield { type: 'done', data: { runId: input.runId } };
  }
}
