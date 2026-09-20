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
  catalogAiInsightsApiRef,
  type CatalogAiInsightsApi
} from '../api';
import type { AiRunEvent, CatalogInsightReport } from '../@types';
import { CatalogInsightsPage } from './CatalogInsightsPage';

const meta: Meta<typeof CatalogInsightsPage> = {
  title: 'Plugins/CatalogAIInsights/CatalogInsightsPage',
  component: CatalogInsightsPage,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: 'Standalone page for asking cited operational questions about catalog entities.'
      }
    }
  }
};
export default meta;
type Story = StoryObj<typeof CatalogInsightsPage>;

const entityRef = 'component:default/payment-gateway';

const report: CatalogInsightReport = {
  entityRef,
  question: 'Where can I find the operational dashboards for this service?',
  intent: 'observability-links',
  status: 'answered',
  answer: [
    {
      text: 'The operational dashboards are available in the payment gateway observability workspace.',
      citations: ['ctx-dashboard']
    }
  ],
  links: [
    {
      label: 'Payment gateway dashboards',
      url: 'https://grafana.example.com/d/payment-gateway',
      citation: 'ctx-dashboard'
    }
  ],
  limitations: [],
  context: [
    {
      id: 'ctx-dashboard',
      source: 'observability',
      kind: 'dashboard-link',
      observedAt: '2026-02-15T10:02:00Z',
      summary: 'The dashboard tracks latency, error rate, and saturation for the payment gateway.',
      reference: 'https://grafana.example.com/d/payment-gateway'
    }
  ]
};

const stream = (...events: AiRunEvent[]) =>
  async function* (): AsyncGenerator<AiRunEvent> {
    yield* events;
  };

const apiFor = (
  askQuestion = stream(),
  streamRunEvents = stream()
): CatalogAiInsightsApi =>
  createMockApi<CatalogAiInsightsApi>({
    askQuestion: createMockFn(askQuestion),
    streamRunEvents: createMockFn(streamRunEvents)
  });

const withApi = (api: CatalogAiInsightsApi) => async () => ({
  mockApis: [[catalogAiInsightsApiRef, api]]
});

const withRoute = (api: CatalogAiInsightsApi, search: string) => ({
  loaders: [withApi(api)],
  parameters: {
    backstage: {
      routeEntries: [`/?${search}`]
    }
  }
});

const answeredEvents = (runId: string) =>
  stream(
    { type: 'step', data: { runId, seq: 1, node: 'context.gather', phase: 'enter' } },
    {
      type: 'tool_result',
      data: {
        runId,
        tool: 'observability.dashboard.list',
        ok: true,
        summary: '1 dashboard found'
      }
    },
    {
      type: 'artifact',
      data: { runId, kind: 'catalog-insight-report', ref: JSON.stringify(report) }
    },
    { type: 'done', data: { runId, sessionId: 'session-1' } }
  );

/** Shows a fresh entity-scoped page and opens the question dialog. */
export const Idle: Story = {
  ...withRoute(apiFor(), `entityRef=${encodeURIComponent(entityRef)}`),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('button', { name: 'Ask a question' })
    ).toBeEnabled();
    await userEvent.click(canvas.getByRole('button', { name: 'Ask a question' }));

    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog).toBeVisible());
    expect(within(dialog).getByDisplayValue(entityRef)).toBeInTheDocument();
  }
};

/** Replays a completed run and renders its cited answer and retained context. */
export const AnsweredRun: Story = {
  ...withRoute(
    apiFor(answeredEvents('run-answered-1')),
    `entityRef=${encodeURIComponent(entityRef)}`
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Ask a question' }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog).toBeVisible());
    await userEvent.type(
      screen.getByLabelText('Insight question'),
      ' Where can I find the operational dashboards for this service? '
    );
    await userEvent.click(screen.getByRole('button', { name: 'Ask' }));
    await expect(
      await canvas.findByText(/operational dashboards are available/i)
    ).toBeInTheDocument();
    await expect(canvas.getByText('Context')).toBeInTheDocument();
    await expect(
      canvas.getByText('observability.dashboard.list succeeded: 1 dashboard found')
    ).toBeInTheDocument();
  }
};

/** Shows a run failure while preserving the entity question controls. */
export const RunError: Story = {
  ...withRoute(
    apiFor(
      undefined,
      stream({
        type: 'error',
        data: { runId: 'run-error-1', message: 'Context gathering failed: observability service unavailable.' }
      })
    ),
    `entityRef=${encodeURIComponent(entityRef)}&run=run-error-1`
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText('Context gathering failed: observability service unavailable.')
    ).toBeInTheDocument();
  }
};

/** Shows that asking is unavailable until a catalog entity reference is supplied. */
export const NoEntitySelected: Story = {
  ...withRoute(apiFor(), ''),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('button', { name: 'Ask a question' })
    ).toBeDisabled();
  }
};