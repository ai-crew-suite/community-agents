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
import { expect, userEvent, within } from 'storybook/test';
import { createMockFn } from '@ai-crew-suite/cli/storybook/mocks';
import type { ReleaseNotesDraft } from '../@types';
import { DraftPreview } from './DraftPreview';

const meta: Meta<typeof DraftPreview> = {
  title: 'Plugins/ReleaseNotesAIGenerator/DraftPreview',
  component: DraftPreview,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: 'Presents categorized customer-facing release notes, citations, and a copyable markdown preview.'
      }
    }
  },
  argTypes: {
    draft: {
      control: 'object',
      description: 'Release-notes draft artifact to render.'
    }
  }
};
export default meta;
type Story = StoryObj<typeof DraftPreview>;

const completeDraft: ReleaseNotesDraft = {
  repoUrl: 'https://github.com/acme/payments-api',
  targetVersion: 'v2.4.0',
  window: {
    since: '2026-02-01T00:00:00Z',
    until: '2026-02-15T00:00:00Z'
  },
  status: 'drafted',
  sections: [
    {
      category: 'feature',
      text: 'Added configurable payment retry policies for transient failures.',
      citations: ['PR-1842', 'PAY-927']
    },
    {
      category: 'fix',
      text: 'Improved webhook delivery when a downstream service briefly times out.',
      citations: ['PR-1851']
    }
  ],
  markdown:
    '## Features\nAdded configurable payment retry policies for transient failures.\n\n## Fixes\nImproved webhook delivery when a downstream service briefly times out.',
  includedChanges: [
    {
      id: 'change-1842',
      category: 'feature',
      title: 'Configurable payment retry policies',
      summary: 'Added retry policy configuration.',
      pullRequest: 'PR-1842',
      ticketKey: 'PAY-927'
    }
  ],
  filteredCount: 2,
  limitations: []
};

const noChangesDraft: ReleaseNotesDraft = {
  ...completeDraft,
  targetVersion: 'v2.4.1',
  status: 'no_changes',
  sections: [],
  markdown: 'No customer-facing changes were found.',
  includedChanges: [],
  filteredCount: 0
};

const partialDraft: ReleaseNotesDraft = {
  ...completeDraft,
  status: 'partial',
  limitations: ['Pull request metadata was unavailable for the final two days of the release window.'],
  filteredCount: 1
};

/** Shows categorized customer-facing copy with source citations and markdown. */
export const CompleteDraft: Story = {
  args: { draft: completeDraft },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('region', { name: 'Release-notes draft' })).toBeInTheDocument();
    await expect(
      canvas.getByRole('heading', { name: 'Release notes v2.4.0' })
    ).toBeInTheDocument();
    await expect(
      canvas.getByText('Added configurable payment retry policies for transient failures.')
    ).toBeInTheDocument();
    await expect(canvas.getByText('Cites: PR-1842, PAY-927')).toBeInTheDocument();
    await expect(canvas.getByLabelText('Copyable markdown preview')).toHaveTextContent(
      '## Features'
    );
  }
};

/** Shows the explicit empty result when no customer-facing changes were found. */
export const NoChanges: Story = {
  args: { draft: noChangesDraft },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText('No customer-facing changes were found in this release window.')
    ).toBeInTheDocument();
    await expect(canvas.queryByRole('heading', { name: 'feature' })).not.toBeInTheDocument();
  }
};

/** Shows a partial draft while preserving its available copy and transparent limitation. */
export const PartialDraft: Story = {
  args: { draft: partialDraft },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Improved webhook delivery when a downstream service briefly times out.')).toBeInTheDocument();
    await expect(canvas.getByText('Cites: PR-1851')).toBeInTheDocument();
  }
};

/** Copies the rendered markdown through the component's native clipboard action. */
export const CopyMarkdown: Story = {
  args: { draft: completeDraft },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const writeText = createMockFn<(text: string) => Promise<void>>(
      async () => undefined
    );
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText }
    });

    await userEvent.click(canvas.getByRole('button', { name: 'Copy markdown' }));
    await expect(writeText).toHaveBeenCalledWith(completeDraft.markdown);
  }
};