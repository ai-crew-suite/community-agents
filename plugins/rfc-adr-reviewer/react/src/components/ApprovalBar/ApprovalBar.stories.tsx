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
  title: 'Plugins/RfcAdrAIReviewer/ApprovalBar',
  component: ApprovalBar,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: 'Provides the human approval gate before an AI-generated critique is posted to a pull request.'
      }
    }
  },
  argTypes: {
    reason: {
      control: 'text',
      description: 'Explanation of why the critique publication requires human verification.'
    },
    onDecide: {
      description: 'Receives the reviewer decision and optional note.'
    }
  }
};
export default meta;
type Story = StoryObj<typeof ApprovalBar>;

const approvalReason =
  'The critique is ready to be posted as a comment on the pull request after human review.';

const createArgs = (): ApprovalBarProps => ({
  reason: approvalReason,
  onDecide: createMockFn<ApprovalBarProps['onDecide']>()
});

/** Shows the pending approval gate and both available reviewer decisions. */
export const PendingApproval: Story = {
  args: createArgs(),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const approval = canvas.getByRole('region', { name: 'Critique publication approval' });

    await expect(within(approval).getByText(approvalReason)).toBeInTheDocument();
    await expect(
      within(approval).getByRole('button', { name: 'Post critique to pull request' })
    ).toBeVisible();
    await expect(within(approval).getByRole('button', { name: 'Reject' })).toBeVisible();
  }
};

/** Approves the critique and captures a trimmed reviewer note. */
export const ApproveWithNote: Story = {
  args: createArgs(),
  play: async ({ args, canvasElement }) => {
    const approval = within(canvasElement).getByRole('region', {
      name: 'Critique publication approval'
    });

    await userEvent.type(
      within(approval).getByRole('textbox', { name: 'Decision note' }),
      '  Reviewed the findings and citations.  '
    );
    await userEvent.click(
      within(approval).getByRole('button', { name: 'Post critique to pull request' })
    );

    await expect(args.onDecide).toHaveBeenCalledWith({
      status: 'approved',
      note: 'Reviewed the findings and citations.'
    });
  }
};

/** Rejects the critique without requiring a reviewer note. */
export const RejectWithoutNote: Story = {
  args: createArgs(),
  play: async ({ args, canvasElement }) => {
    const approval = within(canvasElement).getByRole('region', {
      name: 'Critique publication approval'
    });

    await userEvent.click(within(approval).getByRole('button', { name: 'Reject' }));

    await expect(args.onDecide).toHaveBeenCalledWith({
      status: 'rejected',
      note: undefined
    });
  }
};