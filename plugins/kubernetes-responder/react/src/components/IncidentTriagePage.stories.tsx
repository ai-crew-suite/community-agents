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
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, screen, userEvent, waitFor, within } from 'storybook/test';
import { createMockApi, createMockFn } from '@ai-crew-suite/cli/storybook/mocks';
import {
  kubernetesAiResponderApiRef,
  type KubernetesAiResponderApi
} from '../api';
import type {
  AiRunEvent,
  IncidentTriageReport
} from '../@types';
import { IncidentTriagePage } from './IncidentTriagePage';

const meta: Meta<typeof IncidentTriagePage> = {
  title: 'Plugins/KubernetesAIResponder/IncidentTriagePage',
  component: IncidentTriagePage,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: 'Starts read-only Kubernetes incident investigations and presents their evidence and triage report.'
      }
    }
  }
};
export default meta;
type Story = StoryObj<typeof IncidentTriagePage>;

const entityRef = 'component:default/payments-api';

const evidence = [
  {
    id: 'pod:prod/default/payments-api-1',
    source: 'kubernetes' as const,
    kind: 'pod',
    observedAt: '2026-02-15T10:04:00Z',
    summary: 'Container payments-api was OOMKilled and restarted six times.',
    reference: 'prod/default/Pod/payments-api-1',
    confidence: 'high' as const
  },
  {
    id: 'metric:payments-api-memory',
    source: 'observability' as const,
    kind: 'metric',
    observedAt: '2026-02-15T10:05:00Z',
    summary: 'Memory usage reached 99% shortly before the restart.',
    reference: 'metrics/payments-api/memory-working-set',
    confidence: 'high' as const
  }
];

const report: IncidentTriageReport = {
  incidentId: 'incident-payments-1',
  entityRef,
  status: 'investigated',
  failureClass: 'oom-killed',
  trigger: {
    version: 1,
    source: 'manual',
    occurredAt: '2026-02-15T10:00:00Z',
    entityRef,
    summary: 'Payments API pods restarted after memory pressure.'
  },
  likelyCauses: [
    {
      summary: 'Container exceeded its memory limit',
      confidence: 0.92,
      evidence: ['pod:prod/default/payments-api-1']
    }
  ],
  timeline: evidence,
  recommendedNextSteps: ['Review worker concurrency before changing the memory limit.'],
  limitations: []
};

const stream = (...events: AiRunEvent[]) =>
  async function* (): AsyncGenerator<AiRunEvent> {
    yield* events;
  };

const investigationEvents = (runId: string) =>
  stream(
    { type: 'step', data: { runId, seq: 1, node: 'trigger.validate', phase: 'enter' } },
    { type: 'step', data: { runId, seq: 2, node: 'trigger.validate', phase: 'exit' } },
    { type: 'tool_call', data: { runId, tool: 'kubernetes.workload.resolve', args: {} } },
    {
      type: 'tool_result',
      data: {
        runId,
        tool: 'kubernetes.workload.resolve',
        ok: true,
        summary: 'payments-api resolved'
      }
    },
    {
      type: 'artifact',
      data: { runId, kind: 'incident-triage-report', ref: JSON.stringify(report) }
    },
    { type: 'done', data: { runId } }
  );

const apiFor = (
  startInvestigation = stream(),
  streamRunEvents = stream()
): KubernetesAiResponderApi =>
  createMockApi<KubernetesAiResponderApi>({
    startInvestigation: createMockFn(startInvestigation),
    streamRunEvents: createMockFn(streamRunEvents)
  });

const withApi = (api: KubernetesAiResponderApi) => async () => ({
  mockApis: [[kubernetesAiResponderApiRef, api]]
});

const withRoute = (api: KubernetesAiResponderApi, search = '') => ({
  loaders: [withApi(api)],
  parameters: {
    backstage: {
      routeEntries: [`/?${search}`]
    }
  }
});

const waitForDialog = async () => {
  const dialog = await screen.findByRole('dialog');
  await waitFor(() => expect(dialog).toBeVisible());
  return dialog;
};

/** Shows the idle investigation page with no target selected. */
export const Idle: Story = {
  ...withRoute(apiFor()),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Start investigation' })).toBeVisible();
    await expect(canvas.getByRole('heading', { name: 'Progress' })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: 'Start investigation' }));
    const dialog = await waitForDialog();
    await expect(
      within(dialog).getByRole('heading', { name: 'Start incident investigation' })
    ).toBeInTheDocument();
  }
};

/** Opens the investigation dialog with a catalog entity prefilled from the URL. */
export const PrefilledEntity: Story = {
  ...withRoute(apiFor(), `entityRef=${encodeURIComponent(entityRef)}`),
  play: async () => {
    const dialog = await waitForDialog();
    await expect(within(dialog).getByDisplayValue(entityRef)).toBeInTheDocument();
    await expect(screen.getByRole('button', { name: 'Start investigation' })).toBeEnabled();
  }
};

/** Starts a workload-coordinate investigation and renders its completed report. */
export const WorkloadInvestigation: Story = {
  ...withRoute(apiFor(investigationEvents('run-workload-1'))),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Start investigation' }));
    const dialog = await waitForDialog();
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Workload coordinates' }));
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Cluster' }), 'prod');
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Namespace' }), 'default');
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Workload' }), 'payments-api');
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: 'Summary (optional)' }),
      'OOMKilled'
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Start investigation' }));

    await expect(
      await canvas.findByText(/Container exceeded its memory limit/)
    ).toBeInTheDocument();
    await expect(
      canvas.getByText(/kubernetes\.workload\.resolve succeeded: payments-api resolved/)
    ).toBeInTheDocument();
    await expect(canvas.getByText('Evidence')).toBeInTheDocument();
  }
};

/** Replays a completed investigation from a deep link. */
export const ReplayedRun: Story = {
  ...withRoute(apiFor(undefined, investigationEvents('run-replayed-1')), 'run=run-replayed-1'),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText(/Container exceeded its memory limit/)
    ).toBeInTheDocument();
    await expect(canvas.getByRole('status')).toHaveTextContent('Investigation complete');
  }
};

/** Shows the error state produced by a failed investigation stream. */
export const InvestigationError: Story = {
  ...withRoute(
    apiFor(
      stream({
        type: 'error',
        data: { runId: 'run-error-1', message: 'Kubernetes API unavailable.' }
      })
    )
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Start investigation' }));
    const dialog = await waitForDialog();
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: 'Catalog entity reference' }),
      entityRef
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Start investigation' }));
    await expect(await canvas.findByText('Kubernetes API unavailable.')).toBeInTheDocument();
  }
};