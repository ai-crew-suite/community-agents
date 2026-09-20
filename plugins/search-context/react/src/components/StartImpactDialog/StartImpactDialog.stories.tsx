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
import { StartImpactDialog } from './StartImpactDialog';
import type { StartImpactInput } from '../../@types';

const meta: Meta<typeof StartImpactDialog> = {
  title: 'Plugins/SearchAiContext/StartImpactDialog',
  component: StartImpactDialog,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Collects a bounded source catalog entity and source-change description for a read-only cross-service impact assessment.'
      }
    }
  }
};
export default meta;
type Story = StoryObj<typeof StartImpactDialog>;

const createCallbacks = () => ({
  onClose: createMockFn(() => undefined),
  onAssess: createMockFn((input: StartImpactInput) => {
    void input;
  })
});

/** The modal is not rendered until the page requests an impact assessment. */
export const Closed: Story = {
  args: { open: false, ...createCallbacks() },
  play: async () => {
    await expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  }
};

/** An open dialog requires both a source entity and changed symbol before assessment. */
export const EmptyOpen: Story = {
  args: { open: true, ...createCallbacks() },
  play: async () => {
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog).toBeVisible());
    await expect(screen.getByRole('heading', { name: 'Assess a source change' })).toBeInTheDocument();
    await expect(screen.getByLabelText('Source catalog entity')).toHaveValue('');
    await expect(screen.getByRole('button', { name: 'Assess impact' })).toBeDisabled();
  }
};

/** Submits an endpoint-removal assessment with a suggested replacement and trimmed values. */
export const EndpointRemoved: Story = {
  args: { open: true, ...createCallbacks() },
  play: async ({ args }) => {
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog).toBeVisible());
    await userEvent.type(screen.getByLabelText('Source catalog entity'), ' component:default/payment-gateway ');
    await userEvent.type(screen.getByLabelText('Changed symbol'), ' /v1/charge ');
    await userEvent.type(screen.getByLabelText('Suggested replacement'), ' /v2/charges ');
    await userEvent.click(screen.getByRole('button', { name: 'Assess impact' }));

    await expect(args.onAssess).toHaveBeenCalledWith({
      entityRef: 'component:default/payment-gateway',
      change: {
        kind: 'endpoint_removed',
        symbol: '/v1/charge',
        replacement: '/v2/charges'
      }
    });
  }
};

/** Selects a field rename change kind and submits the required source details without a replacement. */
export const FieldRenamed: Story = {
  args: { open: true, ...createCallbacks() },
  play: async ({ args }) => {
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog).toBeVisible());
    await userEvent.type(screen.getByLabelText('Source catalog entity'), 'component:default/payment-gateway');
    await userEvent.click(screen.getByRole('button', { name: 'endpoint removed' }));
    await userEvent.click(await screen.findByRole('option', { name: 'field renamed' }));
    await userEvent.type(screen.getByLabelText('Changed symbol'), 'paymentMethod');
    await userEvent.click(screen.getByRole('button', { name: 'Assess impact' }));

    await expect(args.onAssess).toHaveBeenCalledWith({
      entityRef: 'component:default/payment-gateway',
      change: {
        kind: 'field_renamed',
        symbol: 'paymentMethod',
        replacement: undefined
      }
    });
  }
};

/** Closes an open assessment dialog without invoking the assessment callback. */
export const Cancelled: Story = {
  args: { open: true, ...createCallbacks() },
  play: async ({ args }) => {
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog).toBeVisible());
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await expect(args.onClose).toHaveBeenCalled();
    await expect(args.onAssess).not.toHaveBeenCalled();
  }
};
