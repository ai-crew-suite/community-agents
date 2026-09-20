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
import React from 'react';
import { createDevApp } from '@backstage/dev-utils';
import { createApiFactory } from '@backstage/core-plugin-api';
import { kubernetesAiResponderPlugin, IncidentTriagePage } from '../src/plugin';
import {
  kubernetesAiResponderApiRef,
  type KubernetesAiResponderApi,
} from '../src/api';
import type {
  AiRunEvent,
  IncidentTriageReport,
  ManualInvestigationInput,
} from '../src/@types';

const report: IncidentTriageReport = {
  incidentId: 'incident-dev-1',
  entityRef: 'component:default/payments-api',
  status: 'investigated',
  failureClass: 'oom-killed',
  trigger: {
    version: 1,
    source: 'manual',
    occurredAt: new Date().toISOString(),
    entityRef: 'component:default/payments-api',
    summary: 'payments-api OOMKilled',
  },
  likelyCauses: [
    {
      summary: 'Container exceeded its memory limit',
      confidence: 0.9,
      evidence: ['pod:prod/default/payments-api-1'],
    },
  ],
  timeline: [
    {
      id: 'workload:prod/default/payments-api',
      source: 'kubernetes',
      kind: 'workload',
      summary: 'Deployment payments-api: 0/3 replicas ready',
      reference: 'prod/default/Deployment/payments-api',
      confidence: 'high',
    },
    {
      id: 'pod:prod/default/payments-api-1',
      source: 'kubernetes',
      kind: 'pod',
      summary: 'Container payments-api(OOMKilled, restarts=6)',
      observedAt: new Date().toISOString(),
      confidence: 'high',
    },
  ],
  recommendedNextSteps: ['Raise the memory limit for payments-api'],
  limitations: ['Model synthesis unavailable: timeout'],
};

async function* cannedRun(runId: string): AsyncGenerator<AiRunEvent> {
  const nodes = [
    'trigger.validate',
    'workload.resolve',
    'workload.snapshot',
    'evidence.route',
    'evidence.collect',
    'evidence.normalize',
    'report.synthesize',
    'report.finalize',
  ];
  let seq = 0;
  for (const node of nodes) {
    yield { type: 'step', data: { runId, seq: ++seq, node, phase: 'enter' } };
    yield { type: 'step', data: { runId, seq: ++seq, node, phase: 'exit' } };
  }
  yield {
    type: 'tool_result',
    data: {
      runId,
      tool: 'kubernetes.workload.get_snapshot',
      ok: true,
      summary: 'snapshot ready',
    },
  };
  yield {
    type: 'artifact',
    data: {
      runId,
      kind: 'incident-triage-report',
      ref: JSON.stringify(report),
    },
  };
  yield { type: 'done', data: { runId } };
}

class MockKubernetesAiResponderApi implements KubernetesAiResponderApi {
  async *startInvestigation(_input: ManualInvestigationInput) {
    yield* cannedRun('dev-run-1');
  }

  async *streamRunEvents(runId: string) {
    yield* cannedRun(runId);
  }
}

createDevApp()
  .registerApi(
    createApiFactory({
      api: kubernetesAiResponderApiRef,
      deps: {},
      factory: () => new MockKubernetesAiResponderApi(),
    }),
  )
  .registerPlugin(kubernetesAiResponderPlugin)
  .addPage({
    element: <IncidentTriagePage />,
    title: 'Kubernetes Incident Triage',
    path: '/kubernetes-ai-responder',
  })
  .render();
