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
import type { AiRunEvent, CritiquePublication, DesignCritique } from '../../@types';
import { rfcAdrReviewerApiRef, type RfcAdrReviewerApi } from '../../api';
import { ReviewPage } from './ReviewPage';

const meta: Meta<typeof ReviewPage> = {
  title: 'Plugins/RfcAdrAIReviewer/ReviewPage',
  component: ReviewPage,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: 'Runs a parallel architecture and security review for an RFC or ADR and surfaces its approval workflow.'
      }
    }
  }
};
export default meta;
type Story = StoryObj<typeof ReviewPage>;

const critique: DesignCritique = {
  repoUrl: 'https://github.com/acme/product',
  path: 'adr/0007-event-bus.md',
  verdict: 'comment',
  findings: [
    {
      id: 'arch-1',
      channel: 'senior-architect',
      severity: 'medium',
      summary: 'The migration needs an explicit rollback plan.',
      citations: ['document-1']
    },
    {
      id: 'sec-1',
      channel: 'security-lead',
      severity: 'high',
      summary: 'Token rotation responsibilities are not documented.',
      citations: ['policy-1']
    }
  ],
  limitations: ['The compliance catalog was unavailable during this review.'],
  evidence: [
    {
      id: 'document-1',
      source: 'document',
      summary: 'ADR adr/0007-event-bus.md'
    }
  ]
};

const publication: CritiquePublication = {
  repoUrl: critique.repoUrl,
  pullRequestId: '1842',
  url: 'https://github.com/acme/product/pull/1842#comment-99',
  critiqueRef: 'critique:adr-0007:event-bus'
};

const stream = (...events: AiRunEvent[]) =>
  async function* (): AsyncGenerator<AiRunEvent> {
    yield* events;
  };

const completedEvents = (runId: string) =>
  stream(
    { type: 'step', data: { runId, seq: 1, node: 'senior-architect', phase: 'enter' } },
    {
      type: 'token',
      data: { runId, node: 'senior-architect', text: 'Reviewing service boundaries and migration sequencing.' }
    },
    { type: 'step', data: { runId, seq: 2, node: 'senior-architect', phase: 'exit' } },
    { type: 'step', data: { runId, seq: 3, node: 'security-lead', phase: 'enter' } },
    {
      type: 'token',
      data: { runId, node: 'security-lead', text: 'Checking token ownership and rotation controls.' }
    },
    { type: 'step', data: { runId, seq: 4, node: 'security-lead', phase: 'exit' } },
    {
      type: 'artifact',
      data: { runId, kind: 'design-critique', ref: JSON.stringify(critique) }
    },
    { type: 'done', data: { runId } }
  );

const apiFor = (
  startReview = stream(),
  streamRunEvents = stream(),
  submitApproval = stream()
): RfcAdrReviewerApi =>
  createMockApi<RfcAdrReviewerApi>({
    startReview: createMockFn(startReview),
    streamRunEvents: createMockFn(streamRunEvents),
    submitApproval: createMockFn(submitApproval)
  });

const withApi = (api: RfcAdrReviewerApi) => async () => ({
  mockApis: [[rfcAdrReviewerApiRef, api]]
});

const withRoute = (api: RfcAdrReviewerApi, search = '') => ({
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

const startReview = async () => {
  const dialog = await waitForDialog();
  await userEvent.type(
    within(dialog).getByRole('textbox', { name: 'Repository URL' }),
    'https://github.com/acme/product'
  );
  await userEvent.type(
    within(dialog).getByRole('textbox', { name: 'Document path' }),
    'adr/0007-event-bus.md'
  );
  await userEvent.click(within(dialog).getByRole('button', { name: 'Start review' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
};

/** Shows the initial review page and opens the design-document dialog. */
export const Idle: Story = {
  ...withRoute(apiFor()),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Start review' })).toBeVisible();
    await expect(canvas.getAllByText('No turns from this perspective yet.')).toHaveLength(2);
    await userEvent.click(canvas.getByRole('button', { name: 'Start review' }));
    await expect(
      within(await waitForDialog()).getByRole('heading', { name: 'Review a design document' })
    ).toBeInTheDocument();
  }
};

/** Starts a review and renders the parallel architecture and security debate. */
export const RunningReview: Story = {
  ...withRoute(
    apiFor(
      stream({
        type: 'step',
        data: { runId: 'run-running-1', seq: 1, node: 'senior-architect', phase: 'enter' }
      })
    )
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Start review' }));
    await startReview();
    await expect(
      within(canvas.getByRole('region', { name: 'Senior Architect review' })).getByText(
        'Reviewing…'
      )
    ).toBeInTheDocument();
    await expect(canvas.getByTestId('progress')).toBeInTheDocument();
  }
};

/** Shows a completed review with its merged critique, findings, and limitations. */
export const ReviewComplete: Story = {
  ...withRoute(apiFor(completedEvents('run-complete-1'))),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Start review' }));
    await startReview();
    await expect(await canvas.findByText('Design critique')).toBeInTheDocument();
    const critiquePanel = canvas.getByRole('region', { name: 'Design critique' });
    await expect(critiquePanel).toHaveTextContent('comment');
    await expect(
      within(critiquePanel).getByText(/The migration needs an explicit rollback plan/)
    ).toBeInTheDocument();
    await expect(critiquePanel).toHaveTextContent(
      'The compliance catalog was unavailable during this review.'
    );
  }
};

/** Replays a completed review from a deep-linked run. */
export const ReplayedRun: Story = {
  ...withRoute(apiFor(undefined, completedEvents('run-replayed-1')), 'run=run-replayed-1'),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Design critique')).toBeInTheDocument();
    await expect(
      within(canvas.getByRole('region', { name: 'Security Lead review' })).getByText(
        'Review complete'
      )
    ).toBeInTheDocument();
  }
};

/** Pauses for human approval and renders the published-comment result after approval. */
export const ApprovalRequired: Story = {
  ...withRoute(
    apiFor(
      stream({
        type: 'approval_request',
        data: {
          runId: 'run-approval-1',
          approvalId: 'approval-1',
          reason: 'Post the reviewed critique as a pull-request comment.',
          effect: 'write'
        }
      }),
      stream(),
      stream(
        {
          type: 'artifact',
          data: {
            runId: 'run-approval-1',
            kind: 'critique-publication',
            ref: JSON.stringify(publication)
          }
        },
        { type: 'done', data: { runId: 'run-approval-1' } }
      )
    )
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Start review' }));
    await startReview();
    const approval = await canvas.findByRole('region', {
      name: 'Critique publication approval'
    });
    await expect(approval).toHaveTextContent('Post the reviewed critique as a pull-request comment.');
    await userEvent.click(
      within(approval).getByRole('button', { name: 'Post critique to pull request' })
    );
    await expect(await canvas.findByText('Critique posted')).toBeInTheDocument();
  }
};

/** Shows a review failure with the backend error detail. */
export const Failed: Story = {
  ...withRoute(
    apiFor(
      stream({
        type: 'error',
        data: { runId: 'run-error-1', message: 'Repository could not be read.' }
      })
    )
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Start review' }));
    await startReview();
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      'Repository could not be read.'
    );
  }
};