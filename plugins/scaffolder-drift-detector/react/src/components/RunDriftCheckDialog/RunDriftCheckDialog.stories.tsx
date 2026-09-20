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
import { RunDriftCheckDialog } from './RunDriftCheckDialog';
import type { CheckDriftInput } from '../../@types';

const meta: Meta<typeof RunDriftCheckDialog> = {
  title: 'Plugins/ScaffolderAiDriftDetector/RunDriftCheckDialog',
  component: RunDriftCheckDialog,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Collects the catalog entity reference and the temporary bounded blueprint values used to start a drift check.'
      }
    }
  }
};
export default meta;
type Story = StoryObj<typeof RunDriftCheckDialog>;

const createCallbacks = () => ({
  onClose: createMockFn(() => undefined),
  onCheck: createMockFn((input: CheckDriftInput) => {
    void input;
  })
});

/** The dialog is not rendered when the parent has not requested it to open. */
export const Closed: Story = {
  args: {
    open: false,
    ...createCallbacks()
  },
  play: async () => {
    await expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  }
};

/** An open dialog starts with an empty required entity field and a disabled submit action. */
export const EmptyOpen: Story = {
  args: {
    open: true,
    ...createCallbacks()
  },
  play: async () => {
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog).toBeVisible());
    await expect(screen.getByLabelText('Catalog entity reference')).toHaveValue('');
    await expect(screen.getByRole('button', { name: 'Check drift' })).toBeDisabled();
  }
};

/** Submits an entity with bounded replica and image expectations and closes the dialog. */
export const FilledAndSubmitted: Story = {
  args: {
    open: true,
    ...createCallbacks()
  },
  play: async ({ args }) => {
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog).toBeVisible());

    await userEvent.type(
      screen.getByLabelText('Catalog entity reference'),
      ' component:default/payments-api '
    );
    await userEvent.type(screen.getByLabelText('Expected replicas (temporary blueprint)'), '3');
    await userEvent.type(
      screen.getByLabelText('Expected image'),
      'ghcr.io/acme/payments-api:1.8.0'
    );
    await userEvent.click(screen.getByRole('button', { name: 'Check drift' }));

    await expect(args.onCheck).toHaveBeenCalledWith({
      entityRef: 'component:default/payments-api',
      blueprint: {
        replicas: 3,
        image: 'ghcr.io/acme/payments-api:1.8.0'
      }
    });
    await expect(args.onClose).toHaveBeenCalled();
  }
};

/** Closes an open dialog without submitting a drift check. */
export const Cancelled: Story = {
  args: {
    open: true,
    ...createCallbacks()
  },
  play: async ({ args }) => {
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog).toBeVisible());
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await expect(args.onClose).toHaveBeenCalled();
    await expect(args.onCheck).not.toHaveBeenCalled();
  }
};
