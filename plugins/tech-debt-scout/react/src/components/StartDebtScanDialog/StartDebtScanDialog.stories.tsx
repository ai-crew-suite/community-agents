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
import { StartDebtScanDialog } from './StartDebtScanDialog';
import type { StartDebtScanInput } from '../../@types';

const meta: Meta<typeof StartDebtScanDialog> = {
  title: 'Plugins/TechDebtAiScout/StartDebtScanDialog',
  component: StartDebtScanDialog,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Collects a repository URL and optional research context for one bounded, read-only technical-debt scan.'
      }
    }
  }
};
export default meta;
type Story = StoryObj<typeof StartDebtScanDialog>;

const createCallbacks = () => ({
  onClose: createMockFn(() => undefined),
  onScan: createMockFn((input: StartDebtScanInput) => {
    void input;
  })
});

/** The modal is not rendered until the parent requests a repository scan. */
export const Closed: Story = {
  args: { open: false, ...createCallbacks() },
  play: async () => {
    await expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  }
};

/** An open dialog starts with a disabled action until an HTTP(S) repository URL is entered. */
export const EmptyOpen: Story = {
  args: { open: true, ...createCallbacks() },
  play: async () => {
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog).toBeVisible());
    await expect(screen.getByRole('heading', { name: 'Scan a repository for technical debt' })).toBeInTheDocument();
    await expect(screen.getByLabelText('Repository URL')).toHaveValue('');
    await expect(screen.getByLabelText('Optional research context')).toHaveValue('');
    await expect(screen.getByRole('button', { name: 'Start scan' })).toBeDisabled();
    await expect(dialog).toHaveTextContent('Secret-shaped literals are redacted');
  }
};

/** Submits a repository scan with trimmed URL and optional research context. */
export const RepositoryScan: Story = {
  args: { open: true, ...createCallbacks() },
  play: async ({ args }) => {
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog).toBeVisible());
    await userEvent.type(screen.getByLabelText('Repository URL'), ' https://github.com/acme/payments ');
    await userEvent.type(screen.getByLabelText('Optional research context'), ' focus on retry debt ');
    await expect(screen.getByRole('button', { name: 'Start scan' })).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: 'Start scan' }));

    await expect(args.onScan).toHaveBeenCalledWith({
      repoUrl: 'https://github.com/acme/payments',
      question: 'focus on retry debt'
    });
    await expect(args.onClose).not.toHaveBeenCalled();
  }
};

/** Accepts an HTTP repository URL without optional research context. */
export const WithoutResearchContext: Story = {
  args: { open: true, ...createCallbacks() },
  play: async ({ args }) => {
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog).toBeVisible());
    await userEvent.type(screen.getByLabelText('Repository URL'), 'http://git.example.com/legacy');
    await userEvent.click(screen.getByRole('button', { name: 'Start scan' }));

    await expect(args.onScan).toHaveBeenCalledWith({
      repoUrl: 'http://git.example.com/legacy',
      question: undefined
    });
  }
};

/** Closes an open scan dialog without invoking the scan callback. */
export const Cancelled: Story = {
  args: { open: true, ...createCallbacks() },
  play: async ({ args }) => {
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog).toBeVisible());
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await expect(args.onClose).toHaveBeenCalled();
    await expect(args.onScan).not.toHaveBeenCalled();
  }
};
