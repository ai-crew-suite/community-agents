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
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { CostPanel } from './CostPanel';
import type { CostPanelProps } from './CostPanel';

const meta: Meta<typeof CostPanel> = {
  title: 'Plugins/ScaffolderAiGuardrailAgent/CostPanel',
  component: CostPanel,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Displays the deterministic budget verdict, estimate, configured threshold, and supporting evidence identifiers.'
      }
    }
  }
};
export default meta;
type Story = StoryObj<typeof CostPanel>;

/** Shows the explicit estimate and threshold produced by a successful cost evaluation. */
export const WithinBudget: Story = {
  args: {
    budget: {
      status: 'within_budget',
      currency: 'USD',
      amount: 420,
      thresholdUsd: 1000,
      evidence: ['cost-estimate-1', 'policy-1']
    }
  } satisfies CostPanelProps,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const panel = canvas.getByRole('region', { name: 'Budget verdict' });
    await expect(panel).toBeInTheDocument();
    await expect(canvas.getByText('Status: within_budget')).toBeInTheDocument();
    await expect(canvas.getByText(/Estimate: USD 420/)).toBeInTheDocument();
    await expect(canvas.getByText(/Threshold: 1000/)).toBeInTheDocument();
    await expect(canvas.getByText('Cites: cost-estimate-1, policy-1')).toBeInTheDocument();
  }
};

/** Uses the configured ceiling when the cost service provides no direct estimate amount. */
export const OverBudgetWithCeiling: Story = {
  args: {
    budget: {
      status: 'over_budget',
      currency: 'EUR',
      ceiling: 750,
      thresholdUsd: 500,
      evidence: ['budget-ceiling-1']
    }
  } satisfies CostPanelProps,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Status: over_budget')).toBeInTheDocument();
    await expect(canvas.getByText(/Estimate: EUR 750/)).toBeInTheDocument();
    await expect(canvas.getByText(/Threshold: 500/)).toBeInTheDocument();
  }
};

/** Communicates that a budget verdict exists but neither estimate nor threshold is known. */
export const Undetermined: Story = {
  args: {
    budget: {
      status: 'undetermined',
      evidence: []
    }
  } satisfies CostPanelProps,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Status: undetermined')).toBeInTheDocument();
    await expect(canvas.getByText(/Estimate: USD undetermined/)).toBeInTheDocument();
    await expect(canvas.getByText(/Threshold: undetermined/)).toBeInTheDocument();
    await expect(canvas.getByText('Cites: none')).toBeInTheDocument();
  }
};

/** Shows the fallback when no budget evaluation was attached to the assessment. */
export const NotEvaluated: Story = {
  args: {} satisfies CostPanelProps,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('region', { name: 'Budget verdict' })).toBeInTheDocument();
    await expect(canvas.getByText('Cost was not evaluated.')).toBeInTheDocument();
  }
};
