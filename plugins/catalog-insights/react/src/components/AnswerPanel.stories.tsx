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
import { expect, userEvent, within } from 'storybook/test';
import type { CatalogInsightReport } from '../@types';
import { AnswerPanel } from './AnswerPanel';

const meta: Meta<typeof AnswerPanel> = {
  title: 'Plugins/CatalogAIInsights/AnswerPanel',
  component: AnswerPanel,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: 'Renders cited catalog insight answers with expandable retained context.'
      }
    }
  },
  argTypes: {
    report: {
      control: 'object',
      description: 'Structured insight report containing answer blocks, citations, links, and limitations.'
    }
  }
};
export default meta;
type Story = StoryObj<typeof AnswerPanel>;

const answeredReport: CatalogInsightReport = {
  entityRef: 'component:default/payment-gateway',
  question: 'Who owns this service and where can I find its operational dashboards?',
  intent: 'ownership-oncall',
  status: 'answered',
  answer: [
    {
      text: 'The payment platform team owns this service and is on call for operational incidents.',
      citations: ['ctx-owner']
    },
    {
      text: 'Operational dashboards are available from the service observability workspace.',
      citations: ['ctx-dashboard']
    }
  ],
  links: [
    {
      label: 'Payment gateway dashboards',
      url: 'https://grafana.example.com/d/payment-gateway',
      citation: 'ctx-dashboard'
    },
    {
      label: 'Payment platform catalog entity',
      url: 'https://backstage.example.com/catalog/default/component/payment-gateway',
      citation: 'ctx-owner'
    }
  ],
  limitations: [],
  context: [
    {
      id: 'ctx-owner',
      source: 'catalog',
      kind: 'entity-summary',
      observedAt: '2026-02-15T10:00:00Z',
      summary: 'Owned by the payment-platform team with the primary on-call rotation configured.',
      reference: 'component:default/payment-gateway'
    },
    {
      id: 'ctx-dashboard',
      source: 'observability',
      kind: 'dashboard-link',
      observedAt: '2026-02-15T10:02:00Z',
      summary: 'The operational dashboard tracks latency, error rate, and saturation.',
      reference: 'https://grafana.example.com/d/payment-gateway'
    }
  ]
};

const partialReport: CatalogInsightReport = {
  ...answeredReport,
  status: 'partial',
  question: 'Why did the last deployment fail?',
  intent: 'deployment-health',
  answer: [
    {
      text: 'The latest deployment entered a degraded state, but the retained context does not identify the root cause.',
      citations: ['ctx-deployment']
    }
  ],
  links: [],
  limitations: [
    'Deployment logs were unavailable for the requested time window.',
    'No incident record linked the deployment to a confirmed cause.'
  ],
  context: [
    {
      id: 'ctx-deployment',
      source: 'kubernetes',
      kind: 'deployment-health',
      summary: 'The deployment reported unavailable replicas during rollout.',
      reference: 'deployment/payment-gateway'
    }
  ]
};

const unsupportedReport: CatalogInsightReport = {
  ...answeredReport,
  status: 'insufficient_context',
  answer: [],
  links: [],
  limitations: ['The evidence floor was not met for this question.'],
  context: []
};

/** Displays a fully cited answer with deep links and expandable context. */
export const CitedAnswer: Story = {
  args: {
    report: answeredReport
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const citation = canvas.getByRole('button', { name: '[ctx-owner]' });

    await expect(citation).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(citation);
    await expect(citation).toHaveAttribute('aria-expanded', 'true');
    await expect(
      canvas.getByText('Owned by the payment-platform team with the primary on-call rotation configured.')
    ).toBeInTheDocument();

    await userEvent.click(citation);
    await expect(citation).toHaveAttribute('aria-expanded', 'false');
    await expect(
      canvas.queryByText('Owned by the payment-platform team with the primary on-call rotation configured.')
    ).not.toBeInTheDocument();
  }
};

/** Shows a partially supported answer with explicit limitations. */
export const PartialAnswer: Story = {
  args: {
    report: partialReport
  }
};

/** Explains when no answer can be supported by the collected context. */
export const InsufficientContext: Story = {
  args: {
    report: unsupportedReport
  }
};