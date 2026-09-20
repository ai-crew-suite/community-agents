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
import { StartAuditDialog } from './StartAuditDialog';
import type { StartJanitorInput } from '../../@types';

const meta: Meta<typeof StartAuditDialog> = {
  title: 'Plugins/TechdocsAiJanitor/StartAuditDialog',
  component: StartAuditDialog,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Collects an explicit catalog entity, repository URL, and markdown paths for one bounded, read-only TechDocs audit.'
      }
    }
  }
};
export default meta;
type Story = StoryObj<typeof StartAuditDialog>;

const createCallbacks = () => ({
  onClose: createMockFn(() => undefined),
  onAudit: createMockFn((input: StartJanitorInput) => {
    void input;
  })
});

/** The modal is not rendered until the parent requests a TechDocs audit. */
export const Closed: Story = {
  args: { open: false, ...createCallbacks() },
  play: async () => {
    await expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  }
};

/** An open audit form requires an entity, HTTP(S) repository URL, and markdown path. */
export const EmptyOpen: Story = {
  args: { open: true, ...createCallbacks() },
  play: async () => {
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog).toBeVisible());
    await expect(screen.getByRole('heading', { name: 'Audit TechDocs markdown' })).toBeInTheDocument();
    await expect(screen.getByLabelText('Catalog entity reference')).toHaveValue('');
    await expect(screen.getByLabelText('Repository URL')).toHaveValue('');
    await expect(screen.getByLabelText('Markdown paths (one per line)')).toHaveValue('');
    await expect(screen.getByRole('button', { name: 'Start audit' })).toBeDisabled();
    await expect(dialog).toHaveTextContent('does not create patches, tickets, or pull requests');
  }
};

/** Submits a scoped audit with trimmed values and multiple explicit markdown paths. */
export const AuditRepository: Story = {
  args: { open: true, ...createCallbacks() },
  play: async ({ args }) => {
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog).toBeVisible());
    await userEvent.type(screen.getByLabelText('Catalog entity reference'), ' component:default/payments ');
    await userEvent.type(screen.getByLabelText('Repository URL'), ' https://github.com/acme/payments ');
    await userEvent.type(screen.getByLabelText('Markdown paths (one per line)'), ' docs/index.md \n docs/runbook.md ');
    await expect(screen.getByRole('button', { name: 'Start audit' })).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: 'Start audit' }));

    await expect(args.onAudit).toHaveBeenCalledWith({
      entityRef: 'component:default/payments',
      repoUrl: 'https://github.com/acme/payments',
      paths: ['docs/index.md', 'docs/runbook.md']
    });
    await expect(args.onClose).not.toHaveBeenCalled();
  }
};

/** Closes an open audit dialog without invoking the audit callback. */
export const Cancelled: Story = {
  args: { open: true, ...createCallbacks() },
  play: async ({ args }) => {
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog).toBeVisible());
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await expect(args.onClose).toHaveBeenCalled();
    await expect(args.onAudit).not.toHaveBeenCalled();
  }
};
