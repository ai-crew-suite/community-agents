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
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { describe, expect, it, vi } from 'vitest';
import {
  kubernetesAiResponderApiRef,
  type KubernetesAiResponderApi,
} from '../api';
import { IncidentTriagePage } from '../components/IncidentTriagePage';
import type { AiRunEvent, IncidentTriageReport } from '../@types';

const report: IncidentTriageReport = {
  incidentId: 'incident-1',
  entityRef: 'component:default/payments-api',
  status: 'investigated',
  failureClass: 'oom-killed',
  trigger: {
    version: 1,
    source: 'manual',
    occurredAt: '2026-01-01T00:00:00.000Z',
    entityRef: 'component:default/payments-api',
    summary: 'OOMKilled',
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
      id: 'pod:prod/default/payments-api-1',
      source: 'kubernetes',
      kind: 'pod',
      summary: 'Container payments-api(OOMKilled, restarts=6)',
      confidence: 'high',
    },
  ],
  recommendedNextSteps: ['Raise the memory limit for payments-api'],
  limitations: [],
};

async function* runEvents(runId: string): AsyncGenerator<AiRunEvent> {
  yield {
    type: 'step',
    data: { runId, seq: 1, node: 'trigger.validate', phase: 'enter' },
  };
  yield {
    type: 'step',
    data: { runId, seq: 2, node: 'trigger.validate', phase: 'exit' },
  };
  yield {
    type: 'tool_call',
    data: { runId, tool: 'kubernetes.workload.get_snapshot', args: {} },
  };
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

const renderPage = (
  api: KubernetesAiResponderApi,
  options?: Parameters<typeof renderInTestApp>[1],
) =>
  renderInTestApp(
    <TestApiProvider apis={[[kubernetesAiResponderApiRef, api]]}>
      <IncidentTriagePage />
    </TestApiProvider>,
    options,
  );

describe('IncidentTriagePage', () => {
  it('runs a manual investigation and renders the report and evidence', async () => {
    const api: KubernetesAiResponderApi = {
      startInvestigation: vi.fn(() => runEvents('run-live-1')),
      streamRunEvents: vi.fn((runId: string) => runEvents(runId)),
    };
    await renderPage(api);

    await userEvent.click(
      screen.getByRole('button', { name: 'Start investigation' }),
    );
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(
      within(dialog).getByLabelText(/Catalog entity reference/),
      'component:default/payments-api',
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Start investigation' }),
    );

    expect(api.startInvestigation).toHaveBeenCalledWith({
      entityRef: 'component:default/payments-api',
    });
    // Progress nodes render, then the report + evidence appear after the artifact.
    expect(
      await screen.findByText(/Container exceeded its memory limit/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Observed data/)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Investigation complete',
    );
  });

  it('replays event history when deep-linked with ?run=<id>', async () => {
    const api: KubernetesAiResponderApi = {
      startInvestigation: vi.fn(() => runEvents('run-live-1')),
      streamRunEvents: vi.fn((runId: string) => runEvents(runId)),
    };
    await renderPage(api, {
      routeEntries: ['/kubernetes-ai-responder?run=run-123'],
    });

    expect(api.streamRunEvents).toHaveBeenCalledWith('run-123');
    expect(
      await screen.findByText(/Container exceeded its memory limit/),
    ).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Investigation complete',
    );
  });

  it('shows the failure state when the run errors', async () => {
    async function* failingRun(runId: string): AsyncGenerator<AiRunEvent> {
      yield {
        type: 'step',
        data: { runId, seq: 1, node: 'trigger.validate', phase: 'enter' },
      };
      yield {
        type: 'error',
        data: { runId, message: 'trigger validation failed' },
      };
    }
    const api: KubernetesAiResponderApi = {
      startInvestigation: vi.fn(() => failingRun('run-err')),
      streamRunEvents: vi.fn((runId: string) => runEvents(runId)),
    };
    await renderPage(api);

    await userEvent.click(
      screen.getByRole('button', { name: 'Start investigation' }),
    );
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(
      within(dialog).getByLabelText(/Catalog entity reference/),
      'component:default/payments-api',
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Start investigation' }),
    );

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Investigation failed',
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'trigger validation failed',
    );
  });
});
