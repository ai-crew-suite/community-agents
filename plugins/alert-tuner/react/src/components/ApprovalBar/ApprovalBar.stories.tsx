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
import { createMockFn } from '@ai-crew-suite/cli/storybook/mocks';
import { ApprovalBar, type ApprovalBarProps } from './ApprovalBar';

const meta: Meta<typeof ApprovalBar> = {
  title: 'Plugins/AgentCrewSuite/ApprovalBar',
  component: ApprovalBar,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: 'Human approval controls for an alert-tuning publication request.'
      }
    }
  },
  argTypes: {
    reason: {
      control: 'text',
      description: 'Why the pending publication requires an explicit human decision.'
    },
    onDecide: {
      description: 'Receives the selected decision and optional reviewer note.'
    }
  }
};
export default meta;
type Story = StoryObj<typeof ApprovalBar>;

const defaultReason =
  'The proposed threshold change will modify alerts/payments-api.yaml in a pull request.';

/** Approval request before the reviewer has entered a decision. */
export const Default: Story = {
  args: {
    reason: defaultReason,
    onDecide: createMockFn<ApprovalBarProps['onDecide']>()
  }
};

/** Verifies that an approval captures the reviewer note and selected status. */
export const ApproveWithNote: Story = {
  args: {
    reason: defaultReason,
    onDecide: createMockFn<ApprovalBarProps['onDecide']>()
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole('textbox', { name: 'Decision note' }), 'Reviewed IaC diff');
    await userEvent.click(canvas.getByRole('button', { name: 'Approve pull request' }));

    await expect(args.onDecide).toHaveBeenCalledWith({
      status: 'approved',
      note: 'Reviewed IaC diff'
    });
  }
};

/** Verifies that rejecting without a note omits the optional note field. */
export const RejectWithoutNote: Story = {
  args: {
    reason: 'Publication is not permitted because the evidence window is incomplete.',
    onDecide: createMockFn<ApprovalBarProps['onDecide']>()
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Reject' }));

    await expect(args.onDecide).toHaveBeenCalledWith({
      status: 'rejected',
      note: undefined
    });
  }
};