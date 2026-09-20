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
import { EntityInsightsCard } from './EntityInsightsCard';

const meta: Meta<typeof EntityInsightsCard> = {
  title: 'Plugins/CatalogAIInsights/EntityInsightsCard',
  component: EntityInsightsCard,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: 'Offers catalog-scoped insight questions and renders cited results on an entity page.'
      }
    }
  },
  argTypes: {
    entityRef: {
      control: 'text',
      description: 'Catalog entity reference targeted by every insight question.'
    }
  }
};
export default meta;
type Story = StoryObj<typeof EntityInsightsCard>;

const entityRef = 'component:default/payment-gateway';

const report: CatalogInsightReport = {
  entityRef,
  question: 'Where can I find logs and dashboards for this service?',
  intent: 'observability-links',
  status: 'answered',
  answer: [
    {
      text: 'The payment gateway operational dashboards are available in the observability workspace.',
      citations: ['ctx-dashboard']
    }
  ],
  links: [
    {
      label: 'Payment gateway dashboard',
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
      summary: 'The dashboard tracks latency, error rate, and saturation.',
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

const cannedQuestionApi = apiFor(answeredEvents('run-canned-1'));
const askQuestionApi = apiFor();
const answeredInsightApi = createMockApi<CatalogAiInsightsApi>({
  askQuestion: createMockFn(() => answeredEvents('run-answered-1')()),
  streamRunEvents: createMockFn()
});

/** Shows the entity card with canned and free-form question actions available. */
export const Default: Story = {
  args: {
    entityRef
  },
  loaders: [withApi(apiFor())]
};

/** Runs the canned observability question and renders its streamed report. */
export const CannedQuestion: Story = {
  args: {
    entityRef
  },
  loaders: [withApi(cannedQuestionApi)],
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Where are the logs?' }));

    await expect(cannedQuestionApi.askQuestion).toHaveBeenCalledWith({
      entityRef,
      question: 'Where can I find logs and dashboards for this service?',
      intentHint: 'observability-links'
    });
    await expect(
      await canvas.findByText(/payment gateway operational dashboards are available/i)
    ).toBeInTheDocument();
  }
};

/** Opens the free-form dialog, submits a question, and verifies the API request. */
export const AskQuestion: Story = {
  args: {
    entityRef
  },
  loaders: [withApi(askQuestionApi)],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Ask a question' }));

    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog).toBeVisible());
    await userEvent.type(
      screen.getByLabelText('Insight question'),
      ' Which team owns this service? '
    );
    await userEvent.click(screen.getByRole('button', { name: 'Ask' }));

    await expect(askQuestionApi.askQuestion).toHaveBeenCalledWith({
      entityRef,
      question: 'Which team owns this service?',
      intentHint: undefined
    });
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );
  }
};

/** Shows a completed cited answer, retained context, and a deep link after a question. */
export const AnsweredInsight: Story = {
  args: {
    entityRef
  },
  loaders: [withApi(answeredInsightApi)],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Where are the logs?' }));
    await expect(answeredInsightApi.askQuestion).toHaveBeenCalledWith({
      entityRef,
      question: 'Where can I find logs and dashboards for this service?',
      intentHint: 'observability-links'
    });
    await expect(
      await canvas.findByText(/payment gateway operational dashboards are available/i)
    ).toBeInTheDocument();
    await expect(canvas.getByText('Context')).toBeInTheDocument();
    await expect(canvas.getByRole('link', { name: 'Open run run-answered-1' })).toBeInTheDocument();
  }
};

/** Shows the error state when the insight stream cannot collect context. */
export const Error: Story = {
  args: {
    entityRef
  },
  loaders: [
    withApi(
      apiFor(
        stream({
          type: 'error',
          data: { runId: 'run-error-1', message: 'Context gathering failed: observability service unavailable.' }
        })
      )
    )
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Who is on call?' }));
    await expect(
      await canvas.findByText('Context gathering failed: observability service unavailable.')
    ).toBeInTheDocument();
  }
};