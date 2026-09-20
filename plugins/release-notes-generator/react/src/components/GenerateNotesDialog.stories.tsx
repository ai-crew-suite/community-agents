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
import { expect, screen, userEvent, waitFor, within } from 'storybook/test';
import { createMockFn } from '@ai-crew-suite/cli/storybook/mocks';
import { GenerateNotesDialog, type GenerateNotesForm } from './GenerateNotesDialog';

type GenerateNotesDialogProps = React.ComponentProps<typeof GenerateNotesDialog>;

const meta: Meta<typeof GenerateNotesDialog> = {
  title: 'Plugins/ReleaseNotesAIGenerator/GenerateNotesDialog',
  component: GenerateNotesDialog,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: 'Collects the repository, target version, and optional date window for a release-notes draft.'
      }
    }
  },
  argTypes: {
    open: {
      control: 'boolean',
      description: 'Whether the generation dialog is visible.'
    },
    onClose: {
      description: 'Called when the dialog is cancelled or generation starts.'
    },
    onGenerate: {
      description: 'Receives the trimmed generation request fields.'
    }
  }
};
export default meta;
type Story = StoryObj<typeof GenerateNotesDialog>;

const waitForDialog = async () => {
  const dialog = await screen.findByRole('dialog');
  await waitFor(() => expect(dialog).toBeVisible());
  return dialog;
};

const createArgs = (): GenerateNotesDialogProps => ({
  open: true,
  onClose: createMockFn<GenerateNotesDialogProps['onClose']>(),
  onGenerate: createMockFn<GenerateNotesDialogProps['onGenerate']>()
});

/** Shows the empty form with generation disabled until required fields are supplied. */
export const Empty: Story = {
  args: createArgs(),
  play: async () => {
    const dialog = await waitForDialog();
    await expect(within(dialog).getByRole('button', { name: 'Generate draft' })).toBeDisabled();
  }
};

/** Generates release notes with an explicit bounded date window. */
export const GenerateWithWindow: Story = {
  args: createArgs(),
  play: async ({ args }) => {
    const dialog = await waitForDialog();
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: 'Repository URL' }),
      '  https://github.com/acme/payments-api  '
    );
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: 'Target version' }),
      '  v2.4.0  '
    );
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: 'Window start (optional ISO timestamp)' }),
      '2026-02-01T00:00:00Z'
    );
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: 'Window end (optional ISO timestamp)' }),
      '2026-02-15T00:00:00Z'
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Generate draft' }));

    await expect(args.onGenerate).toHaveBeenCalledWith({
      repoUrl: 'https://github.com/acme/payments-api',
      targetVersion: 'v2.4.0',
      since: '2026-02-01T00:00:00Z',
      until: '2026-02-15T00:00:00Z'
    } satisfies GenerateNotesForm);
    await expect(args.onClose).toHaveBeenCalledTimes(1);
  }
};

/** Generates release notes using only the required repository and version fields. */
export const GenerateRequiredFields: Story = {
  args: createArgs(),
  play: async ({ args }) => {
    const dialog = await waitForDialog();
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: 'Repository URL' }),
      'https://github.com/acme/product'
    );
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Target version' }), 'v1.2.0');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Generate draft' }));

    await expect(args.onGenerate).toHaveBeenCalledWith({
      repoUrl: 'https://github.com/acme/product',
      targetVersion: 'v1.2.0',
      since: undefined,
      until: undefined
    } satisfies GenerateNotesForm);
  }
};

/** Cancels the dialog without starting a release-notes generation run. */
export const Cancel: Story = {
  args: createArgs(),
  play: async ({ args }) => {
    const dialog = await waitForDialog();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await expect(args.onClose).toHaveBeenCalledTimes(1);
    await expect(args.onGenerate).not.toHaveBeenCalled();
  }
};