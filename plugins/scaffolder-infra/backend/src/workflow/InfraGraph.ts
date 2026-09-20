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
import type { ScaffolderInfraConfig } from '../config';
import { infraReportArtifact } from '../services/InfraArtifactWriter';
import { BlueprintResolver } from '../services/BlueprintResolver';
import { generatePreview } from './generation';
import { InfraRequestValidationError, parseInfraQuery } from './intake';

/** Stable preview workflow identifier for Scaffolder IaC generation. */
export const SCAFFOLDER_INFRA_WORKFLOW_ID = 'scaffolder-infra';

/** Deterministic preview runner that never writes to a Scaffolder workspace. */
export class InfraGraph implements WorkflowRunner {
  readonly id = SCAFFOLDER_INFRA_WORKFLOW_ID;

  constructor(
    private readonly config: ScaffolderInfraConfig,
    private readonly resolver: BlueprintResolver
  ) {}

  async *run(input: AgentRunInput, _context: WorkflowContext): AsyncIterable<AgentEvent> {
    let seq = 0;

    const step = (node: string, phase: 'enter' | 'exit'): AgentEvent => ({
      type: 'step',
      data: { runId: input.runId, seq: ++seq, node, phase }
    });

    let request;
    try {
      request = parseInfraQuery(input.input.query, input.trigger ? 'action' : 'manual', this.config);
    } catch (error) {
      yield {
        type: 'error',
        data: {
          runId: input.runId,
          message: error instanceof InfraRequestValidationError || error instanceof Error
            ? error.message
            : String(error)
        }
      };
      return;
    }

    yield step('blueprint.load', 'enter');

    let resolved;
    try {
      resolved = await this.resolver.resolve(request);
    } catch (error) {
      yield infraReportArtifact(input.runId, {
        serviceName: request.serviceName,
        provider: request.provider,
        role: request.provider === 'terraform' ? 'terraform-expert' : 'cloudformation-expert',
        status: 'blueprint_unavailable',
        files: [],
        findings: [],
        corrections: 0,
        limitations: [error instanceof Error ? error.message : String(error)],
        evidence: []
      });

      yield { type: 'done', data: { runId: input.runId } };
      return;
    }

    yield step('blueprint.load', 'exit');

    if (!resolved) {
      yield infraReportArtifact(input.runId, {
        serviceName: request.serviceName,
        provider: request.provider,
        role: request.provider === 'terraform' ? 'terraform-expert' : 'cloudformation-expert',
        status: 'blueprint_unavailable',
        files: [],
        findings: [],
        corrections: 0,
        limitations: ['No approved blueprint matches this provider and requested blueprint ID.'],
        evidence: []
      });

      yield { type: 'done', data: { runId: input.runId } };
      return;
    }

    yield step('generate', 'enter');
    const preview = generatePreview({
      request,
      blueprintId: resolved.source.id,
      blueprintUrl: resolved.source.url,
      blueprint: resolved.content
    });

    yield step('validate', 'enter');
    yield infraReportArtifact(input.runId, preview.report);

    yield step('validate', 'exit');
    yield step('generate', 'exit');

    yield { type: 'done', data: { runId: input.runId } };
  }
}
