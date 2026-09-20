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
import type { StepEvent, ToolEvent } from '../hooks/useIncidentRun';
import { RunTimeline } from './RunTimeline';

const meta: Meta<typeof RunTimeline> = {
  title: 'Plugins/KubernetesAIResponder/RunTimeline',
  component: RunTimeline,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: 'Shows workflow-node progress and bounded diagnostic tool activity for an investigation.'
      }
    }
  },
  argTypes: {
    steps: {
      control: 'object',
      description: 'Ordered workflow-node lifecycle events from the investigation.'
    },
    toolEvents: {
      control: 'object',
      description: 'Ordered diagnostic tool calls and results.'
    }
  }
};
export default meta;
type Story = StoryObj<typeof RunTimeline>;

const emptyActivity: { steps: StepEvent[]; toolEvents: ToolEvent[] } = {
  steps: [],
  toolEvents: []
};

const activeActivity: { steps: StepEvent[]; toolEvents: ToolEvent[] } = {
  steps: [
    { node: 'trigger.validate', phase: 'enter', seq: 1 },
    { node: 'workload.resolve', phase: 'enter', seq: 2 }
  ],
  toolEvents: [
    { kind: 'call', tool: 'kubernetes.workload.resolve' },
    { kind: 'result', tool: 'kubernetes.workload.resolve', ok: true, summary: 'Workload resolved' },
    { kind: 'call', tool: 'kubernetes.pod.describe' }
  ]
};

const completedActivity: { steps: StepEvent[]; toolEvents: ToolEvent[] } = {
  steps: [
    { node: 'trigger.validate', phase: 'enter', seq: 1 },
    { node: 'trigger.validate', phase: 'exit', seq: 2 },
    { node: 'workload.resolve', phase: 'enter', seq: 3 },
    { node: 'workload.resolve', phase: 'exit', seq: 4 },
    { node: 'evidence.collect', phase: 'enter', seq: 5 },
    { node: 'evidence.collect', phase: 'exit', seq: 6 },
    { node: 'report.compose', phase: 'enter', seq: 7 },
    { node: 'report.compose', phase: 'exit', seq: 8 }
  ],
  toolEvents: [
    { kind: 'result', tool: 'kubernetes.workload.resolve', ok: true, summary: 'Workload resolved' },
    { kind: 'result', tool: 'kubernetes.pod.logs', ok: true, summary: '6 bounded observations' },
    { kind: 'result', tool: 'vcs.pull_request.list', ok: false, summary: 'Repository unavailable' }
  ]
};

/** Shows the progress heading before any investigation events arrive. */
export const Idle: Story = {
  args: emptyActivity
};

/** Shows active workflow nodes and in-flight diagnostic tools. */
export const ActiveRun: Story = {
  args: activeActivity
};

/** Shows completed workflow nodes and successful and failed diagnostics. */
export const CompletedRun: Story = {
  args: completedActivity
};