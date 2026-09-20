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
import { expect, screen, userEvent, waitFor } from 'storybook/test';
import { createMockFn } from '@ai-crew-suite/cli/storybook/mocks';
import { EvaluateRequestDialog } from './EvaluateRequestDialog';
import type { EvaluateRequestDialogProps } from './EvaluateRequestDialog';
import type { EvaluateRequestInput } from '../../@types';

const meta: Meta<typeof EvaluateRequestDialog> = {
  title: 'Plugins/ScaffolderAiGuardrailAgent/EvaluateRequestDialog',
  component: EvaluateRequestDialog,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Collects a template reference, optional environment, and JSON parameters before an advisory guardrail evaluation.'
      }
    }
  }
};
export default meta;
type Story = StoryObj<typeof EvaluateRequestDialog>;

const createCallbacks = (): Pick<EvaluateRequestDialogProps, 'onClose' | 'onEvaluate'> => ({
  onClose: createMockFn(() => undefined),
  onEvaluate: createMockFn((input: EvaluateRequestInput) => {
    void input;
  })
});

/** The dialog is not rendered when the parent has not requested an evaluation. */
export const Closed: Story = {
  args: { open: false, ...createCallbacks() },
  play: async () => {
    await expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  }
};

/** An open request starts with a required template reference and a disabled evaluation action. */
export const EmptyOpen: Story = {
  args: { open: true, ...createCallbacks() },
  play: async () => {
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog).toBeVisible());
    await expect(screen.getByRole('heading', { name: 'Evaluate template request' })).toBeInTheDocument();
    await expect(screen.getByLabelText('Template reference')).toHaveValue('');
    await expect(screen.getByRole('button', { name: 'Evaluate' })).toBeDisabled();
  }
};

/** Shows the form-level validation message when submitted parameters are not valid JSON. */
export const InvalidParameters: Story = {
  args: { open: true, ...createCallbacks() },
  play: async () => {
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog).toBeVisible());
    await userEvent.type(screen.getByLabelText('Template reference'), 'template:default/database');
    const parameters = screen.getByLabelText('Parameters (JSON)');
    await userEvent.clear(parameters);
    await userEvent.click(parameters);
    await userEvent.paste('{not-json');
    await userEvent.click(screen.getByRole('button', { name: 'Evaluate' }));

    await expect(screen.getByText('Parameters must be a JSON object.')).toBeInTheDocument();
  }
};

/** Submits valid JSON and normalizes whitespace before passing the evaluation request upward. */
export const FilledAndSubmitted: Story = {
  args: { open: true, ...createCallbacks() },
  play: async ({ args }) => {
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog).toBeVisible());
    await userEvent.type(
      screen.getByLabelText('Template reference'),
      ' template:default/database '
    );
    await userEvent.type(screen.getByLabelText('Environment (optional)'), ' production ');
    const parameters = screen.getByLabelText('Parameters (JSON)');
    await userEvent.clear(parameters);
    await userEvent.click(parameters);
    await userEvent.paste('{"instanceType":"db.m5.large","multiAz":true}');
    await userEvent.click(screen.getByRole('button', { name: 'Evaluate' }));

    await expect(args.onEvaluate).toHaveBeenCalledWith({
      templateRef: 'template:default/database',
      environment: 'production',
      parameters: { instanceType: 'db.m5.large', multiAz: true }
    });
    await expect(args.onClose).toHaveBeenCalled();
  }
};

/** Closes an open request without evaluating it. */
export const Cancelled: Story = {
  args: { open: true, ...createCallbacks() },
  play: async ({ args }) => {
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog).toBeVisible());
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await expect(args.onClose).toHaveBeenCalled();
    await expect(args.onEvaluate).not.toHaveBeenCalled();
  }
};
