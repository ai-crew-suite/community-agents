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
import { StartResearchDialog } from './StartResearchDialog';
import type { StartArcheologyInput } from '../../@types';

const meta: Meta<typeof StartResearchDialog> = {
  title: 'Plugins/SearchAiArcheology/StartResearchDialog',
  component: StartResearchDialog,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Collects one bounded ticket-triage research question and either a repository URL or catalog entity scope.'
      }
    }
  }
};
export default meta;
type Story = StoryObj<typeof StartResearchDialog>;

const createCallbacks = () => ({
  onClose: createMockFn(() => undefined),
  onResearch: createMockFn((input: StartArcheologyInput) => {
    void input;
  })
});

/** The modal is not rendered until the parent requests a research session. */
export const Closed: Story = {
  args: { open: false, ...createCallbacks() },
  play: async () => {
    await expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  }
};

/** An open dialog requires both a research question and a research scope. */
export const EmptyOpen: Story = {
  args: { open: true, ...createCallbacks() },
  play: async () => {
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog).toBeVisible());
    await expect(screen.getByRole('heading', { name: 'Research legacy-system familiarity' })).toBeInTheDocument();
    await expect(screen.getByLabelText('Research question')).toHaveValue('');
    await expect(screen.getByRole('button', { name: 'Start research' })).toBeDisabled();
  }
};

/** Submits a repository-scoped question and trims both text inputs for the parent to close. */
export const RepositoryScoped: Story = {
  args: { open: true, ...createCallbacks() },
  play: async ({ args }) => {
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog).toBeVisible());
    await userEvent.type(
      screen.getByLabelText('Research question'),
      ' Who has triaged payment-reconciliation incidents? '
    );
    await userEvent.type(
      screen.getByLabelText('Repository URL'),
      ' https://github.com/acme/payment-gateway '
    );
    await userEvent.click(screen.getByRole('button', { name: 'Start research' }));

    await expect(args.onResearch).toHaveBeenCalledWith({
      question: 'Who has triaged payment-reconciliation incidents?',
      repoUrl: 'https://github.com/acme/payment-gateway'
    });
  }
};

/** Submits an entity-scoped question without a repository URL. */
export const EntityScoped: Story = {
  args: { open: true, ...createCallbacks() },
  play: async ({ args }) => {
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog).toBeVisible());
    await userEvent.type(screen.getByLabelText('Research question'), 'Who knows the payment gateway?');
    await userEvent.type(
      screen.getByLabelText('Catalog entity reference'),
      ' component:default/payment-gateway '
    );
    await userEvent.click(screen.getByRole('button', { name: 'Start research' }));

    await expect(args.onResearch).toHaveBeenCalledWith({
      question: 'Who knows the payment gateway?',
      entityRef: 'component:default/payment-gateway'
    });
  }
};

/** Closes an open research dialog without invoking the research callback. */
export const Cancelled: Story = {
  args: { open: true, ...createCallbacks() },
  play: async ({ args }) => {
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog).toBeVisible());
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await expect(args.onClose).toHaveBeenCalled();
    await expect(args.onResearch).not.toHaveBeenCalled();
  }
};
