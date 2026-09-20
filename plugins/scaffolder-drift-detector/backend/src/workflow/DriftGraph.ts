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
  KubernetesWorkloadRef,
  KubernetesWorkloadSnapshot,
  WorkflowContext,
  WorkflowRunner
} from '@ai-crew-suite/plugin-kernel-node';
import type { DriftDetectorConfig } from '../config';
import { DriftToolRunner } from '../services/DriftToolRunner';
import { createDriftReportArtifactEvent } from '../services/DriftArtifactWriter';
import { computeDrift } from './delta';
import { liveEvidence, normalizeLiveSnapshot } from './liveState';
import { DriftRequestValidationError, parseDriftQuery } from './request';
import type { DriftCheckRequest, EvidenceRef } from './state';

/** Stable workflow ID for deterministic Scaffolder drift reconciliation. */
export const SCAFFOLDER_DRIFT_WORKFLOW_ID = 'scaffolder-drift';

const reportStatus = (
  toolLimitations: string[],
  itemCount: number
): 'in_sync' | 'drifted' | 'partial' => {
  if (toolLimitations.length > 0) return 'partial';
  return itemCount > 0 ? 'drifted' : 'in_sync';
};

/** Read-only detection graph with explicit degradation for unavailable shared contracts. */
export class DriftGraph implements WorkflowRunner {
  readonly id = SCAFFOLDER_DRIFT_WORKFLOW_ID;

  constructor(private readonly config: DriftDetectorConfig) {}

  /** Runs one live Kubernetes versus supplied golden-path reconciliation. */
  async *run(input: AgentRunInput, context: WorkflowContext): AsyncIterable<AgentEvent> {
    let seq = 0;

    const step = (node: string, phase: 'enter' | 'exit'): AgentEvent => ({
      type: 'step',
      data: { runId: input.runId, seq: ++seq, node, phase }
    });

    let request: DriftCheckRequest;
    try {
      request = parseDriftQuery(
        input.input.query,
        input.trigger ? 'scheduler' : 'manual',
        this.config.maxInfraFiles
      );
    } catch (error) {
      yield {
        type: 'error',
        data: {
          runId: input.runId,
          message: error instanceof DriftRequestValidationError || error instanceof Error
            ? error.message
            : String(error)
        }
      };
      return;
    }

    const limitations = [
      'Cloud topology reconciliation is unavailable until cloud.resource.* tools are normalized.',
      'Remediation PR creation is unavailable until vcs.pull_request.create is registered.',
    ];

    if (request.remediate || this.config.remediate.enabled) {
      limitations.push('Remediation was requested but this run is detect-only.');
    }

    if (!request.blueprint) {
      yield createDriftReportArtifactEvent(input.runId, {
        entityRef: request.entityRef,
        status: 'insufficient_evidence',
        items: [],
        limitations: [
          ...limitations,
          'Golden-path blueprint provenance is unavailable; supply bounded blueprint data until the shared Scaffolder reader is registered.'
        ],
        evidence: []
      });

      yield { type: 'done', data: { runId: input.runId } };
      return;
    }

    const evidence: EvidenceRef[] = [
      { id: 'bp-1', source: 'blueprint', summary: `Golden path for ${request.entityRef}` }
    ];

    const tools = new DriftToolRunner(context, this.config.maxToolInvocations);

    yield step('livestate.ingest', 'enter');

    const resolved = await tools.invoke(
      'kubernetes.workload.resolve',
      { entityRef: request.entityRef }
    );

    const workload = Array.isArray(resolved?.output) ? resolved.output[0] : undefined;
    if (!workload) {
      yield step('livestate.ingest', 'exit');

      yield createDriftReportArtifactEvent(input.runId, {
        entityRef: request.entityRef,
        status: 'insufficient_evidence',
        items: [],
        limitations: [
          ...limitations,
          ...tools.limitations,
          'No Kubernetes workload could be resolved for this component.'
        ],
        evidence
      });

      yield { type: 'done', data: { runId: input.runId } };
      return;
    }

    const snapshot = await tools.invoke<KubernetesWorkloadRef, KubernetesWorkloadSnapshot>(
      'kubernetes.workload.get_snapshot',
      workload
    );

    yield step('livestate.ingest', 'exit');

    if (!snapshot?.output) {
      yield createDriftReportArtifactEvent(input.runId, {
        entityRef: request.entityRef,
        status: 'insufficient_evidence',
        items: [],
        limitations: [
          ...limitations,
          ...tools.limitations,
          'Live workload snapshot was unavailable.'
        ],
        evidence
      });

      yield { type: 'done', data: { runId: input.runId } };
      return;
    }

    evidence.push(liveEvidence(snapshot.output));

    yield step('delta.compute', 'enter');

    const items = computeDrift(
      request.blueprint,
      normalizeLiveSnapshot(snapshot.output)
    ).slice(0, this.config.maxDriftItems);

    yield step('delta.compute', 'exit');

    yield createDriftReportArtifactEvent(input.runId, {
      entityRef: request.entityRef,
      status: reportStatus(tools.limitations, items.length),
      items,
      limitations: [...limitations, ...tools.limitations],
      evidence
    });

    yield { type: 'done', data: { runId: input.runId } };
  }
}
