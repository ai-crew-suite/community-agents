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
import type { AlertTuningRunState } from '../../hooks/useAlertTuningRun';
import { TuningRunView } from './TuningRunView';

const meta: Meta<typeof TuningRunView> = {
  title: 'Plugins/AgentCrewSuite/TuningRunView',
  component: TuningRunView,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: 'Shows graph-node progress and bounded tool activity from an alert-tuning run.'
      }
    }
  },
  argTypes: {
    state: {
      control: 'object',
      description: 'Render-ready state accumulated from live or replayed run events.'
    }
  }
};
export default meta;
type Story = StoryObj<typeof TuningRunView>;

const idleState: AlertTuningRunState = {
  phase: 'idle',
  steps: [],
  tools: [],
  rejected: false
};

const activeState: AlertTuningRunState = {
  phase: 'running',
  runId: 'run-9921-xyz',
  steps: [
    { node: 'collect-evidence', phase: 'enter' },
    { node: 'collect-evidence', phase: 'exit' },
    { node: 'analyze-noise', phase: 'enter' }
  ],
  tools: [
    { tool: 'incident.alert.history' },
    { tool: 'metrics.alert.self_clear', ok: true, summary: '42 samples analyzed' },
    { tool: 'vcs.repository.read_file', ok: false, summary: 'Repository access denied' }
  ],
  rejected: false
};

const finishedState: AlertTuningRunState = {
  phase: 'finished',
  runId: 'run-finished-1',
  steps: [
    { node: 'collect-evidence', phase: 'enter' },
    { node: 'collect-evidence', phase: 'exit' },
    { node: 'analyze-noise', phase: 'enter' },
    { node: 'analyze-noise', phase: 'exit' }
  ],
  tools: [
    { tool: 'incident.alert.history', ok: true, summary: '42 firings found' },
    { tool: 'metrics.alert.self_clear', ok: true, summary: '86% auto-resolve ratio' }
  ],
  rejected: false
};

/** Shows the empty progress view before an evaluation starts. */
export const Idle: Story = {
  args: {
    state: idleState
  }
};

/** Shows active node progress and called, successful, and failed tools. */
export const ActiveRun: Story = {
  args: {
    state: activeState
  }
};

/** Shows the completed run activity retained for review. */
export const CompletedRun: Story = {
  args: {
    state: finishedState
  }
};