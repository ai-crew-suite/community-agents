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
import { expect, within } from 'storybook/test';
import type { DesignCritique } from '../../@types';
import {
  initialReviewRunState,
  type ReviewRunState
} from '../../hooks/useReviewRun';
import { DebateView } from './DebateView';

const meta: Meta<typeof DebateView> = {
  title: 'Plugins/RfcAdrAIReviewer/DebateView',
  component: DebateView,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: 'Shows the parallel Senior Architect and Security Lead review channels, findings, and transcript fallback.'
      }
    }
  },
  argTypes: {
    state: {
      control: 'object',
      description: 'Accumulated review state containing channel transcripts and findings.'
    }
  }
};
export default meta;
type Story = StoryObj<typeof DebateView>;

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
  limitations: [],
  evidence: []
};

const activeState: ReviewRunState = {
  ...initialReviewRunState,
  phase: 'running',
  runId: 'run-active-1',
  channels: {
    'senior-architect': {
      status: 'running',
      transcript: 'Reviewing service boundaries and migration sequencing.'
    },
    'security-lead': {
      status: 'done',
      transcript: 'Checking token ownership and rotation controls.'
    }
  },
  critique
};

const completedState: ReviewRunState = {
  ...activeState,
  phase: 'finished',
  compiled: true,
  channels: {
    'senior-architect': { ...activeState.channels['senior-architect'], status: 'done' },
    'security-lead': { ...activeState.channels['security-lead'], status: 'done' }
  }
};

const untaggedState: ReviewRunState = {
  ...initialReviewRunState,
  phase: 'running',
  untaggedTranscript: 'The review stream did not include channel labels; showing combined turns.'
};

/** Shows both empty review perspectives before the debate emits any turns. */
export const Idle: Story = {
  args: { state: initialReviewRunState },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getAllByText('No turns from this perspective yet.')
    ).toHaveLength(2);
  }
};

/** Shows active multi-channel transcripts and findings from both reviewers. */
export const ActiveDebate: Story = {
  args: { state: activeState },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const architect = canvas.getByRole('region', { name: 'Senior Architect review' });
    const security = canvas.getByRole('region', { name: 'Security Lead review' });

    await expect(architect).toHaveTextContent('Reviewing…');
    await expect(architect).toHaveTextContent(
      'Reviewing service boundaries and migration sequencing.'
    );
    await expect(security).toHaveTextContent('Review complete');
    await expect(security).toHaveTextContent('Token rotation responsibilities are not documented.');
  }
};

/** Shows completed perspectives with findings from the merged critique. */
export const CompletedDebate: Story = {
  args: { state: completedState },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByText('Review complete')).toHaveLength(2);
    await expect(
      within(canvas.getByRole('region', { name: 'Senior Architect review' })).getByText(
        /The migration needs an explicit rollback plan\./
      )
    ).toBeInTheDocument();
    await expect(
      within(canvas.getByRole('region', { name: 'Security Lead review' })).getByText(
        /Token rotation responsibilities are not documented\./
      )
    ).toBeInTheDocument();
  }
};

/** Shows the combined transcript fallback for streams without channel labels. */
export const UntaggedTranscript: Story = {
  args: { state: untaggedState },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Review transcript')).toBeInTheDocument();
    await expect(
      canvas.getByText('The review stream did not include channel labels; showing combined turns.')
    ).toBeInTheDocument();
    await expect(
      canvas.queryByRole('region', { name: 'Senior Architect review' })
    ).not.toBeInTheDocument();
  }
};