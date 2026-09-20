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
import type { HandoverRunState } from '../hooks/useHandoverRun';
import { HandoverRunView } from './HandoverRunView';

const meta: Meta<typeof HandoverRunView> = {
  title: 'Plugins/OncallHandoverAssistant/HandoverRunView',
  component: HandoverRunView,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: 'Shows workflow-node progress and bounded tool activity for a handover run.'
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
type Story = StoryObj<typeof HandoverRunView>;

const idleState: HandoverRunState = {
  phase: 'idle',
  steps: [],
  tools: []
};

const activeState: HandoverRunState = {
  phase: 'running',
  runId: 'run-active-1',
  steps: [
    { node: 'collect-signals', phase: 'enter' },
    { node: 'cluster-context', phase: 'enter' }
  ],
  tools: [
    { tool: 'incident.incident.list', ok: true, summary: '4 active incidents' },
    { tool: 'deployments.recent', summary: 'Collecting recent changes' }
  ]
};

const completedState: HandoverRunState = {
  phase: 'finished',
  runId: 'run-completed-1',
  steps: [
    { node: 'collect-signals', phase: 'enter' },
    { node: 'collect-signals', phase: 'exit' },
    { node: 'cluster-context', phase: 'enter' },
    { node: 'cluster-context', phase: 'exit' },
    { node: 'compose-brief', phase: 'enter' },
    { node: 'compose-brief', phase: 'exit' }
  ],
  tools: [
    { tool: 'incident.incident.list', ok: true, summary: '4 active incidents' },
    { tool: 'deployments.recent', ok: false, summary: 'Deployment service unavailable' },
    { tool: 'tickets.open.list' }
  ]
};

/** Shows the progress heading and explanatory empty state before a handover run emits activity. */
export const Idle: Story = {
  args: { state: idleState },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('No run activity yet.')).toBeInTheDocument();
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