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
import { IntentInputForm } from './IntentInputForm';
import type { StartIntentInput } from '../../@types';

const meta: Meta<typeof IntentInputForm> = {
  title: 'Plugins/ScaffolderAiIntent/IntentInputForm',
  component: IntentInputForm,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Collects one bounded natural-language provisioning request for schema-grounded template selection.'
      }
    }
  }
};
export default meta;
type Story = StoryObj<typeof IntentInputForm>;

const createSubmit = () =>
  createMockFn((input: StartIntentInput) => {
    void input;
  });

/** Shows the empty form before a provisioning request has been entered. */
export const Empty: Story = {
  args: { onSubmit: createSubmit() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('region', { name: 'Provisioning intent' })).toBeInTheDocument();
    await expect(canvas.getByRole('textbox', { name: 'Provisioning request' })).toHaveValue('');
    await expect(canvas.getByRole('button', { name: 'Generate proposal' })).toBeDisabled();
  }
};

/** Enables the proposal action when a bounded natural-language request is present. */
export const ReadyToSubmit: Story = {
  args: { onSubmit: createSubmit() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const request = canvas.getByRole('textbox', { name: 'Provisioning request' });
    await userEvent.type(request, 'Create a React app called payment-gateway.');
    await expect(canvas.getByRole('button', { name: 'Generate proposal' })).toBeEnabled();
    await expect(canvas.getByText(/For example: Create a react app/)).toBeInTheDocument();
  }
};

/** Trims the request before invoking the typed submission callback. */
export const Submitted: Story = {
  args: { onSubmit: createSubmit() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      canvas.getByRole('textbox', { name: 'Provisioning request' }),
      ' Create a Go service called orders-api. '
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Generate proposal' }));
    await expect(args.onSubmit).toHaveBeenCalledWith({
      utterance: 'Create a Go service called orders-api.'
    });
  }
};

/** Keeps the form action unavailable while the parent marks proposal generation disabled. */
export const Disabled: Story = {
  args: { onSubmit: createSubmit(), disabled: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      canvas.getByRole('textbox', { name: 'Provisioning request' }),
      'Create a service called billing-api.'
    );
    await expect(canvas.getByRole('button', { name: 'Generate proposal' })).toBeDisabled();
  }
};
