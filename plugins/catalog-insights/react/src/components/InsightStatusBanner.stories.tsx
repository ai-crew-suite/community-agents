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
import type { CatalogInsightReport } from '../@types';
import type { InsightRunPhase } from '../hooks/useInsightRun';
import { InsightStatusBanner } from './InsightStatusBanner';

type InsightStatusBannerProps = React.ComponentProps<typeof InsightStatusBanner>;

const meta: Meta<typeof InsightStatusBanner> = {
  title: 'Plugins/CatalogAIInsights/InsightStatusBanner',
  component: InsightStatusBanner,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: 'Communicates the current lifecycle and evidence quality of a catalog insight run.'
      }
    }
  },
  argTypes: {
    phase: {
      control: 'select',
      options: ['idle', 'running', 'finished', 'error'] satisfies InsightRunPhase[],
      description: 'Current lifecycle phase of the insight run.'
    },
    report: {
      control: 'object',
      description: 'Completed report whose status determines the final banner tone and message.'
    },
    error: {
      control: 'text',
      description: 'Failure detail displayed when the run cannot complete.'
    }
  }
};
export default meta;
type Story = StoryObj<typeof InsightStatusBanner>;

const answeredReport: CatalogInsightReport = {
  entityRef: 'component:default/payment-gateway',
  question: 'Who is on call for this service?',
  intent: 'ownership-oncall',
  status: 'answered',
  answer: [
    {
      text: 'The payment-platform team is on call for this service.',
      citations: ['ctx-owner']
    }
  ],
  links: [],
  limitations: [],
  context: [
    {
      id: 'ctx-owner',
      source: 'catalog',
      kind: 'entity-summary',
      summary: 'Payment gateway is owned by the payment-platform team.'
    }
  ]
};

const baseFinishedProps: Omit<InsightStatusBannerProps, 'phase'> = {
  report: answeredReport,
  error: undefined
};

/** Prompts the user to ask the first question before an insight run has started. */
export const Idle: Story = {
  args: {
    phase: 'idle',
    ...baseFinishedProps
  }
};

/** Announces that context is currently being gathered for the question. */
export const Running: Story = {
  args: {
    phase: 'running',
    report: undefined,
    error: undefined
  }
};

/** Handles a completed run that did not produce a report artifact. */
export const FinishedWithoutReport: Story = {
  args: {
    phase: 'finished',
    report: undefined,
    error: undefined
  }
};

/** Confirms that a complete answer is ready for the user. */
export const AnswerReady: Story = {
  args: {
    phase: 'finished',
    ...baseFinishedProps
  }
};

/** Warns that the answer is supported only by an incomplete context set. */
export const PartialAnswer: Story = {
  args: {
    phase: 'finished',
    report: { ...answeredReport, status: 'partial' },
    error: undefined
  }
};

/** Warns that no usable context was available for the question. */
export const InsufficientContext: Story = {
  args: {
    phase: 'finished',
    report: { ...answeredReport, status: 'insufficient_context' },
    error: undefined
  }
};

/** Shows the failure message supplied by the insight run. */
export const Failed: Story = {
  args: {
    phase: 'error',
    report: undefined,
    error: 'Context gathering failed: observability service unavailable.'
  }
};