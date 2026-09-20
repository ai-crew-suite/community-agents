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
import type { ReleaseNotesRunState } from '../hooks/useReleaseNotesRun';
import { ReleaseNotesRunView } from './ReleaseNotesRunView';

const meta: Meta<typeof ReleaseNotesRunView> = {
  title: 'Plugins/ReleaseNotesAIGenerator/ReleaseNotesRunView',
  component: ReleaseNotesRunView,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: 'Shows workflow-node progress and bounded tool activity for a release-notes run.'
      }
    }
  },
  argTypes: {
    state: {
      control: 'object',
      description: 'Accumulated run state containing workflow steps and tool activity.'
    }
  }
};
export default meta;
type Story = StoryObj<typeof ReleaseNotesRunView>;

const idleState: ReleaseNotesRunState = {
  phase: 'idle',
  steps: [],
  tools: []
};

const activeState: ReleaseNotesRunState = {
  phase: 'running',
  runId: 'run-active-1',
  steps: [
    { node: 'collect-changes', phase: 'enter' },
    { node: 'categorize-changes', phase: 'enter' }
  ],
  tools: [
    { tool: 'vcs.pull_request.list', ok: true, summary: '3 merged pull requests' },
    { tool: 'knowledge.retrieve', summary: 'Gathering release-note context' }
  ]
};

const completedState: ReleaseNotesRunState = {
  phase: 'finished',
  runId: 'run-completed-1',
  steps: [
    { node: 'collect-changes', phase: 'enter' },
    { node: 'collect-changes', phase: 'exit' },
    { node: 'categorize-changes', phase: 'enter' },
    { node: 'categorize-changes', phase: 'exit' },
    { node: 'draft-release-notes', phase: 'enter' },
    { node: 'draft-release-notes', phase: 'exit' }
  ],
  tools: [
    { tool: 'vcs.pull_request.list', ok: true, summary: '3 merged pull requests' },
    { tool: 'knowledge.retrieve', ok: false, summary: 'Knowledge source unavailable' },
    { tool: 'vcs.release.publish' }
  ]
};

/** Shows the progress heading and explanatory state before a run emits activity. */
export const Idle: Story = {
  args: { state: idleState },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText('No release-notes run activity yet.')
    ).toBeInTheDocument();
  }
};

/** Shows active workflow nodes, a completed tool, and an in-flight tool. */
export const ActiveRun: Story = {
  args: { state: activeState }
};

/** Shows completed workflow nodes with successful, failed, and in-flight tools. */
export const CompletedRun: Story = {
  args: { state: completedState }
};