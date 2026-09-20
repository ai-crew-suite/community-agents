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
import { createMockApi, createMockFn } from '@ai-crew-suite/cli/storybook/mocks';
import type { AiRunEvent, ReleaseNotesDraft, ReleaseNotesPublication } from '../@types';
import { releaseNotesApiRef, type ReleaseNotesApi } from '../api';
import { ReleaseNotesPage } from './ReleaseNotesPage';

const meta: Meta<typeof ReleaseNotesPage> = {
  title: 'Plugins/ReleaseNotesAIGenerator/ReleaseNotesPage',
  component: ReleaseNotesPage,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: 'Generates, reviews, and approves cited release-notes drafts from merged pull requests.'
      }
    }
  }
};
export default meta;
type Story = StoryObj<typeof ReleaseNotesPage>;

const draft: ReleaseNotesDraft = {
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
      citations: ['PR-1842']
    }
  ],
  markdown: '## Features\nAdded configurable payment retry policies for transient failures.',
  includedChanges: [
    {
      id: 'change-1842',
      category: 'feature',
      title: 'Configurable payment retry policies',
      summary: 'Added retry policy configuration.',
      pullRequest: 'PR-1842'
    }
  ],
  filteredCount: 1,
  limitations: []
};

const noChangesDraft: ReleaseNotesDraft = {
  ...draft,
  targetVersion: 'v2.4.1',
  status: 'no_changes',
  sections: [],
  markdown: 'No customer-facing changes were found.',
  includedChanges: [],
  filteredCount: 0
};

const publication: ReleaseNotesPublication = {
  repoUrl: draft.repoUrl,
  targetVersion: draft.targetVersion,
  url: 'https://github.com/acme/payments-api/releases/tag/v2.4.0',
  draftRef: 'draft:payments-api:v2.4.0'
};

const stream = (...events: AiRunEvent[]) =>
  async function* (): AsyncGenerator<AiRunEvent> {
    yield* events;
  };

const draftEvents = (runId: string, artifact = draft) =>
  stream(
    { type: 'step', data: { runId, seq: 1, node: 'collect-changes', phase: 'enter' } },
    {
      type: 'tool_result',
      data: { runId, tool: 'vcs.pull_request.list', ok: true, summary: '3 merged pull requests' }
    },
    { type: 'step', data: { runId, seq: 2, node: 'collect-changes', phase: 'exit' } },
    {
      type: 'artifact',
      data: { runId, kind: 'release-notes-draft', ref: JSON.stringify(artifact) }
    },
    { type: 'done', data: { runId } }
  );

const apiFor = (
  generate = stream(),
  streamRunEvents = stream(),
  submitApproval = stream()
): ReleaseNotesApi =>
  createMockApi<ReleaseNotesApi>({
    generate: createMockFn(generate),
    streamRunEvents: createMockFn(streamRunEvents),
    submitApproval: createMockFn(submitApproval)
  });

const withApi = (api: ReleaseNotesApi) => async () => ({
  mockApis: [[releaseNotesApiRef, api]]
});

const withRoute = (api: ReleaseNotesApi, search = '') => ({
  loaders: [withApi(api)],
  parameters: {
    backstage: {
      routeEntries: [`/?${search}`]
    }
  }
});

const waitForDialog = async () => {
  const dialog = await screen.findByRole('dialog');
  await waitFor(() => expect(dialog).toBeVisible());
  return dialog;
};

const submitGeneration = async (team: string) => {
  const dialog = await waitForDialog();
  await userEvent.type(
    within(dialog).getByRole('textbox', { name: 'Repository URL' }),
    'https://github.com/acme/payments-api'
  );
  await userEvent.type(within(dialog).getByRole('textbox', { name: 'Target version' }), 'v2.4.0');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Generate draft' }));
  return team;
};

/** Shows the untouched page with its generation action and empty progress area. */
export const Idle: Story = {
  ...withRoute(apiFor()),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Generate draft' })).toBeVisible();
    await expect(canvas.getByText('Progress')).toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: 'Generate draft' }));
    await expect(
      within(await waitForDialog()).getByRole('heading', { name: 'Generate release notes' })
    ).toBeInTheDocument();
  }
};

/** Generates a draft and renders its cited release notes and run activity. */
export const GenerateDraft: Story = {
  ...withRoute(apiFor(draftEvents('run-draft-1'))),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Generate draft' }));
    await submitGeneration('');
    await expect(await canvas.findByText('Added configurable payment retry policies for transient failures.')).toBeInTheDocument();
    await expect(canvas.getByText('Cites: PR-1842')).toBeInTheDocument();
  }
};

/** Shows an in-progress generation while the backend is collecting changes. */
export const Generating: Story = {
  ...withRoute(
    apiFor(
      stream({
        type: 'step',
        data: { runId: 'run-generating-1', seq: 1, node: 'collect-changes', phase: 'enter' }
      })
    )
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Generate draft' }));
    await submitGeneration('');
    await expect(canvas.getByText('collect-changes · enter')).toBeInTheDocument();
    await expect(canvas.getByTestId('progress')).toBeInTheDocument();
  }
};

/** Shows a completed run with no customer-facing changes. */
export const NoChanges: Story = {
  ...withRoute(apiFor(draftEvents('run-no-changes-1', noChangesDraft))),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Generate draft' }));
    await submitGeneration('');
    await expect(
      await canvas.findByText('No customer-facing changes were found in this release window.')
    ).toBeInTheDocument();
  }
};

/** Replays a completed draft from a deep-linked run. */
export const ReplayedRun: Story = {
  ...withRoute(apiFor(undefined, draftEvents('run-replayed-1')), 'run=run-replayed-1'),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Added configurable payment retry policies for transient failures.')).toBeInTheDocument();
    await expect(canvas.getByText('collect-changes · exit')).toBeInTheDocument();
  }
};

/** Pauses at the human publication approval gate and resumes after approval. */
export const ApprovalRequired: Story = {
  ...withRoute(
    apiFor(
      stream(
        {
          type: 'approval_request',
          data: {
            runId: 'run-approval-1',
            approvalId: 'approval-1',
            reason: 'Publishing this release-notes draft will add a pull-request comment.',
            effect: 'write'
          }
        }
      ),
      stream(),
      stream(
        {
          type: 'artifact',
          data: {
            runId: 'run-approval-1',
            kind: 'release-notes-publication',
            ref: JSON.stringify(publication)
          }
        },
        { type: 'done', data: { runId: 'run-approval-1' } }
      )
    )
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Generate draft' }));
    await submitGeneration('');
    const approval = await canvas.findByRole('region', { name: 'Publication approval' });
    await expect(approval).toHaveTextContent(
      'Publishing this release-notes draft will add a pull-request comment.'
    );
    await userEvent.click(
      within(approval).getByRole('button', { name: 'Approve publication' })
    );
    await expect(await canvas.findByText('Release v2.4.0 published.')).toBeInTheDocument();
  }
};

/** Shows a failed generation with its actionable backend error. */
export const Failed: Story = {
  ...withRoute(
    apiFor(
      stream({
        type: 'error',
        data: { runId: 'run-error-1', message: 'Pull request service unavailable.' }
      })
    )
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Generate draft' }));
    await submitGeneration('');
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      'Pull request service unavailable.'
    );
  }
};