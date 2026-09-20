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
import {
  catalogAiInsightsPlugin,
  CatalogInsightsPage,
} from '../src/plugin';
import {
  catalogAiInsightsApiRef,
  type CatalogAiInsightsApi,
} from '../src/api';
import type {
  AiRunEvent,
  CatalogInsightReport,
} from '../src/@types';

const report: CatalogInsightReport = {
  entityRef: 'component:default/payment-gateway',
  question: 'Who is on call for this service?',
  intent: 'ownership-oncall',
  status: 'answered',
  answer: [
    {
      text: 'The primary on-call is the payments-platform rotation.',
      citations: ['ctx-1'],
    },
  ],
  links: [
    {
      label: 'PagerDuty schedule',
      url: 'https://example.pagerduty.com/schedules/payments',
      citation: 'ctx-1',
    },
  ],
  limitations: [],
  context: [
    {
      id: 'ctx-1',
      source: 'incident',
      kind: 'oncall',
      summary: 'On-call rotation: payments-platform',
      reference: 'https://example.pagerduty.com/schedules/payments',
    },
    {
      id: 'ctx-2',
      source: 'catalog',
      kind: 'entity-summary',
      summary: 'Component payment-gateway owned by group:default/payments',
    },
  ],
};

async function* cannedRun(runId: string): AsyncGenerator<AiRunEvent> {
  const nodes = [
    'request.validate',
    'intent.classify',
    'context.gather',
    'context.retrieve',
    'context.normalize',
    'insight.synthesize',
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
      tool: 'incident.oncall.get',
      ok: true,
      summary: 'rotation resolved',
    },
  };
  yield {
    type: 'artifact',
    data: {
      runId,
      kind: 'catalog-insight-report',
      ref: JSON.stringify(report),
    },
  };
  yield { type: 'done', data: { runId, sessionId: 'dev-session-1' } };
}

class MockCatalogAiInsightsApi implements CatalogAiInsightsApi {
  async *askQuestion() {
    yield* cannedRun('dev-run-1');
  }

  async *streamRunEvents(runId: string) {
    yield* cannedRun(runId);
  }
}

createDevApp()
  .registerApi(
    createApiFactory({
      api: catalogAiInsightsApiRef,
      deps: {},
      factory: () => new MockCatalogAiInsightsApi(),
    }),
  )
  .registerPlugin(catalogAiInsightsPlugin)
  .addPage({
    element: <CatalogInsightsPage />,
    title: 'Catalog AI Insights',
    path: '/catalog-ai-insights',
  })
  .render();
