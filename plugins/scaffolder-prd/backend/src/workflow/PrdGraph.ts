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
import type { ScaffolderPrdConfig } from '../config';
import { deliveryBlueprintArtifact } from '../services/PrdArtifactWriter';
import { mergeBlueprint } from './merge';
import { parsePrd, PrdRequestValidationError } from './parse';

/** Stable workflow identifier for cited PRD delivery blueprints. */
export const SCAFFOLDER_PRD_WORKFLOW_ID = 'scaffolder-prd';

/** Builds three deterministic cited channels concurrently without external writes. */
export class PrdGraph implements WorkflowRunner {
  readonly id = SCAFFOLDER_PRD_WORKFLOW_ID;

  constructor(private readonly config: ScaffolderPrdConfig) {}

  async *run(
    input: AgentRunInput,
    _context: WorkflowContext,
  ): AsyncIterable<AgentEvent> {
    let parsed;
    try {
      parsed = parsePrd(input.input.query, this.config.maxPrdChars);
    } catch (error) {
      yield {
        type: 'error',
        data: {
          runId: input.runId,
          message:
            error instanceof PrdRequestValidationError || error instanceof Error
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

    const title = parsed.request.title || parsed.spans[0].text.slice(0, 120);

    yield step('pm', 'enter');
    yield step('engineer', 'enter');
    yield step('writer', 'enter');

    const [pm, engineer, writer] = await Promise.all([
      Promise.resolve({
        epic: {
          title,
          description: parsed.spans[0].text,
          evidence: [parsed.spans[0].id],
        },
        stories: parsed.spans
          .slice(1, this.config.maxStories + 1)
          .map((span, index) => ({
            id: `story-${index + 1}`,
            title: span.text.slice(0, 120),
            description: span.text,
            evidence: [span.id],
          })),
      }),
      Promise.resolve({
        templateRef: this.config.allowedTemplates[0],
        score: 1,
        parameters: [],
        issues: [],
        evidence: [parsed.spans[0].id],
      }),
      Promise.resolve({
        files: [
          {
            path: 'docs/architecture.md',
            sections: ['Overview', 'Requirements', 'Open questions'],
            evidence: [parsed.spans[0].id],
          },
        ],
        evidence: [parsed.spans[0].id],
      }),
    ]);

    yield step('pm', 'exit');
    yield step('engineer', 'exit');
    yield step('writer', 'exit');
    yield step('join.merge', 'enter');

    yield deliveryBlueprintArtifact(
      input.runId,
      mergeBlueprint({
        title,
        ...pm,
        template: engineer,
        documentation: writer,
      }),
    );

    yield step('join.merge', 'exit');
    yield { type: 'done', data: { runId: input.runId } };
  }
}
