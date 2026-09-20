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
import { PreviewGenerationDialog } from './PreviewGenerationDialog';
import type { PreviewGenerationDialogProps } from './PreviewGenerationDialog';
import type { PreviewGenerationInput } from '../../@types';

const meta: Meta<typeof PreviewGenerationDialog> = {
  title: 'Plugins/ScaffolderAiInfra/PreviewGenerationDialog',
  component: PreviewGenerationDialog,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Collects one bounded provider, service, and optional region request for a non-writing infrastructure preview.'
      }
    }
  }
};
export default meta;
type Story = StoryObj<typeof PreviewGenerationDialog>;

const createCallbacks = (): Pick<PreviewGenerationDialogProps, 'onClose' | 'onPreview'> => ({
  onClose: createMockFn(() => undefined),
  onPreview: createMockFn((input: PreviewGenerationInput) => {
    void input;
  })
});

/** The dialog is not rendered when the parent has not requested a preview. */
export const Closed: Story = {
  args: { open: false, ...createCallbacks() },
  play: async () => {
    await expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  }
};

/** An open preview form starts with Terraform selected and a disabled action until a service is entered. */
export const EmptyOpen: Story = {
  args: { open: true, ...createCallbacks() },
  play: async () => {
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog).toBeVisible());
    await expect(screen.getByRole('heading', { name: 'Preview infrastructure generation' })).toBeInTheDocument();
    await expect(screen.getByRole('button', { name: 'Terraform' })).toBeInTheDocument();
    await expect(screen.getByLabelText('Service name')).toHaveValue('');
    await expect(screen.getByRole('button', { name: 'Preview only' })).toBeDisabled();
  }
};

/** Submits a valid Terraform preview request and trims the service and region values. */
export const TerraformPreview: Story = {
  args: { open: true, ...createCallbacks() },
  play: async ({ args }) => {
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog).toBeVisible());
    await userEvent.type(screen.getByLabelText('Service name'), ' payments-api ');
    await userEvent.type(screen.getByLabelText('Region (optional)'), ' us-east-1 ');
    await userEvent.click(screen.getByRole('button', { name: 'Preview only' }));

    await expect(args.onPreview).toHaveBeenCalledWith({
      provider: 'terraform',
      serviceName: 'payments-api',
      region: 'us-east-1'
    });
    await expect(args.onClose).toHaveBeenCalled();
  }
};

/** Selects CloudFormation and submits a preview without an optional region. */
export const CloudFormationPreview: Story = {
  args: { open: true, ...createCallbacks() },
  play: async ({ args }) => {
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog).toBeVisible());
    await userEvent.click(screen.getByRole('button', { name: 'Terraform' }));
    await userEvent.click(await screen.findByRole('option', { name: 'CloudFormation' }));
    await expect(screen.getByRole('button', { name: 'CloudFormation' })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Service name'), 'orders-api');
    await userEvent.click(screen.getByRole('button', { name: 'Preview only' }));

    await expect(args.onPreview).toHaveBeenCalledWith({
      provider: 'cloudformation',
      serviceName: 'orders-api',
      region: undefined
    });
    await expect(args.onClose).toHaveBeenCalled();
  }
};

/** Closes an open preview form without starting generation. */
export const Cancelled: Story = {
  args: { open: true, ...createCallbacks() },
  play: async ({ args }) => {
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog).toBeVisible());
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await expect(args.onClose).toHaveBeenCalled();
    await expect(args.onPreview).not.toHaveBeenCalled();
  }
};
