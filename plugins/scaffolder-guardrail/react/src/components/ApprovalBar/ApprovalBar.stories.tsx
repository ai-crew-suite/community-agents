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
import { expect, userEvent, within } from 'storybook/test';
import { createMockFn } from '@ai-crew-suite/cli/storybook/mocks';
import { ApprovalBar } from './ApprovalBar';
import type { ApprovalBarProps } from './ApprovalBar';
import type { GuardrailAssessment } from '../../@types';

const meta: Meta<typeof ApprovalBar> = {
  title: 'Plugins/ScaffolderAiGuardrailAgent/ApprovalBar',
  component: ApprovalBar,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Presents the human decision point for a negotiable guardrail alternative or an escalation exception request.'
      }
    }
  }
};
export default meta;
type Story = StoryObj<typeof ApprovalBar>;

const baseAssessment: Omit<GuardrailAssessment, 'status'> = {
  templateRef: 'template:default/database',
  fingerprint: 'assessment-7f3a',
  violations: [],
  budget: { status: 'within_budget', evidence: [] },
  mutations: [
    {
      id: 'mutation-instance-type',
      parameter: 'instanceType',
      from: 'large',
      to: 'small',
      resolves: ['cost-ceiling'],
      rationale: 'Keeps the generated database within the approved cost ceiling.'
    }
  ],
  confidence: 'high',
  limitations: [],
  evidence: []
};

const createArgs = (
  assessment: GuardrailAssessment,
  reason: string
): ApprovalBarProps => ({
  assessment,
  reason,
  onDecide: createMockFn(() => undefined)
});

/** Offers acceptance of a configured mutation while retaining an explicit reject path. */
export const Negotiable: Story = {
  args: createArgs(
    { ...baseAssessment, status: 'negotiable' },
    'The requested instance type exceeds the policy preference; accept the smaller approved alternative?'
  ),
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('region', { name: 'Guardrail negotiation' })).toBeInTheDocument();
    await expect(canvas.getByText(/requested instance type exceeds/)).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Accept mutation' })).toBeInTheDocument();

    await userEvent.click(canvas.getByRole('button', { name: 'Accept mutation' }));
    await expect(args.onDecide).toHaveBeenCalledWith(true);
  }
};

/** Requests an exception for an escalation while keeping rejection available to the user. */
export const Escalation: Story = {
  args: createArgs(
    { ...baseAssessment, status: 'escalate' },
    'The requested database configuration needs an explicit platform exception.'
  ),
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Request exception' })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: 'Reject' }));
    await expect(args.onDecide).toHaveBeenCalledWith(false);
  }
};

/** Hides the decision controls when the guardrail assessment is blocked. */
export const Blocked: Story = {
  args: createArgs(
    { ...baseAssessment, status: 'blocked', mutations: [] },
    'This request is blocked by a non-negotiable policy violation.'
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole('region', { name: 'Guardrail negotiation' })).not.toBeInTheDocument();
  }
};
