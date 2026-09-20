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
import {
  EvaluateAlertDialog,
  type EvaluateAlertDialogProps
} from './EvaluateAlertDialog';

const meta: Meta<typeof EvaluateAlertDialog> = {
  title: 'Plugins/AgentCrewSuite/EvaluateAlertDialog',
  component: EvaluateAlertDialog,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: 'Collects the bounded scope for an alert-fatigue evaluation.'
      }
    }
  },
  argTypes: {
    open: {
      control: 'boolean',
      description: 'Whether the evaluation dialog is displayed.'
    },
    onClose: {
      description: 'Called when the reviewer cancels or submits the evaluation.'
    },
    onEvaluate: {
      description: 'Receives the validated evaluation scope.'
    }
  }
};
export default meta;
type Story = StoryObj<typeof EvaluateAlertDialog>;

const createDialogArgs = (): EvaluateAlertDialogProps => ({
  open: true,
  onClose: createMockFn<EvaluateAlertDialogProps['onClose']>(),
  onEvaluate: createMockFn<EvaluateAlertDialogProps['onEvaluate']>()
});

/** Open dialog with no alert or service selected; evaluation remains disabled. */
export const Empty: Story = {
  args: createDialogArgs(),
  play: async () => {
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog).toBeVisible());
    expect(screen.getByRole('button', { name: 'Evaluate' })).toBeDisabled();
  }
};

/** Submits a service-scoped evaluation with repository and window details. */
export const SubmitServiceEvaluation: Story = {
  args: createDialogArgs(),
  play: async ({ args }) => {
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog).toBeVisible());

    await userEvent.type(screen.getByLabelText('Service'), 'checkout');
    await userEvent.type(
      screen.getByLabelText('Infrastructure repository URL'),
      'https://github.com/acme/infra'
    );
    await userEvent.type(screen.getByLabelText('IaC path'), 'alerts/checkout.yaml');
    await userEvent.clear(screen.getByLabelText('Window days'));
    await userEvent.type(screen.getByLabelText('Window days'), '30');
    await userEvent.click(screen.getByRole('button', { name: 'Evaluate' }));

    await expect(args.onEvaluate).toHaveBeenCalledWith({
      alertId: undefined,
      service: 'checkout',
      repoUrl: 'https://github.com/acme/infra',
      iacPath: 'alerts/checkout.yaml',
      windowDays: 30
    });
    await expect(args.onClose).toHaveBeenCalledTimes(1);
  }
};

/** Cancels an open evaluation without submitting any evaluation input. */
export const Cancel: Story = {
  args: createDialogArgs(),
  play: async ({ args }) => {
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog).toBeVisible());
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await expect(args.onClose).toHaveBeenCalledTimes(1);
    await expect(args.onEvaluate).not.toHaveBeenCalled();
  }
};