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
import { expect, screen, userEvent, waitFor } from 'storybook/test';
import { createMockFn } from '@ai-crew-suite/cli/storybook/mocks';
import { AskInsightDialog } from './AskInsightDialog';

const meta: Meta<typeof AskInsightDialog> = {
  title: 'Plugins/CatalogAIInsights/AskInsightDialog',
  component: AskInsightDialog,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: 'Collects a catalog entity question and an optional deterministic intent hint.'
      }
    }
  },
  argTypes: {
    open: {
      control: 'boolean',
      description: 'Whether the question dialog is displayed.'
    },
    entityRef: {
      control: 'text',
      description: 'Catalog entity reference the question applies to.'
    },
    onClose: {
      description: 'Called when the dialog is cancelled or the question is submitted.'
    },
    onAsk: {
      description: 'Receives the trimmed question and optional intent hint.'
    }
  }
};
export default meta;
type Story = StoryObj<typeof AskInsightDialog>;

const createDialogArgs = () => ({
  open: true,
  entityRef: 'component:default/payment-gateway',
  onClose: createMockFn<() => void>(),
  onAsk: createMockFn<(form: { question: string; intentHint?: string }) => void>()
});

const waitForDialog = async () => {
  const dialog = await screen.findByRole('dialog');
  await waitFor(() => expect(dialog).toBeVisible());
};

/** Shows the empty question state with submission disabled. */
export const Empty: Story = {
  args: createDialogArgs(),
  play: async () => {
    await waitForDialog();
    expect(screen.getByRole('button', { name: 'Ask' })).toBeDisabled();
  }
};

/** Submits a question with an explicit deployment-health intent hint. */
export const SubmitWithIntentHint: Story = {
  args: createDialogArgs(),
  play: async ({ args }) => {
    await waitForDialog();
    await userEvent.type(
      screen.getByLabelText('Insight question'),
      ' Why did the last deployment fail? '
    );

    await userEvent.click(screen.getByRole('button', { name: 'Detect automatically' }));
    await userEvent.click(screen.getByRole('option', { name: 'Deployment health' }));
    await userEvent.click(screen.getByRole('button', { name: 'Ask' }));

    await expect(args.onAsk).toHaveBeenCalledWith({
      question: 'Why did the last deployment fail?',
      intentHint: 'deployment-health'
    });
    await expect(args.onClose).toHaveBeenCalledTimes(1);
  }
};

/** Cancels the dialog without submitting a question. */
export const Cancel: Story = {
  args: createDialogArgs(),
  play: async ({ args }) => {
    await waitForDialog();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await expect(args.onClose).toHaveBeenCalledTimes(1);
    await expect(args.onAsk).not.toHaveBeenCalled();
  }
};