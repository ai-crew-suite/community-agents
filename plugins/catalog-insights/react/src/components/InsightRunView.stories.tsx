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
import type { StepEvent, ToolEvent } from '../hooks/useInsightRun';
import { InsightRunView } from './InsightRunView';

const meta: Meta<typeof InsightRunView> = {
  title: 'Plugins/CatalogAIInsights/InsightRunView',
  component: InsightRunView,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: 'Shows workflow-node progress and bounded context-gathering tool activity.'
      }
    }
  },
  argTypes: {
    steps: {
      control: 'object',
      description: 'Ordered graph-node lifecycle events from the insight run.'
    },
    toolEvents: {
      control: 'object',
      description: 'Ordered tool calls and results collected during context gathering.'
    }
  }
};
export default meta;
type Story = StoryObj<typeof InsightRunView>;

const noActivity: { steps: StepEvent[]; toolEvents: ToolEvent[] } = {
  steps: [],
  toolEvents: []
};

const activeRun: { steps: StepEvent[]; toolEvents: ToolEvent[] } = {
  steps: [
    { node: 'request.validate', phase: 'enter', seq: 1 },
    { node: 'intent.classify', phase: 'enter', seq: 2 }
  ],
  toolEvents: [
    { kind: 'call', tool: 'catalog.entity.get' },
    { kind: 'result', tool: 'catalog.entity.get', ok: true, summary: 'Entity metadata loaded' },
    { kind: 'call', tool: 'incident.oncall.current' }
  ]
};

const completedRun: { steps: StepEvent[]; toolEvents: ToolEvent[] } = {
  steps: [
    { node: 'request.validate', phase: 'enter', seq: 1 },
    { node: 'request.validate', phase: 'exit', seq: 2 },
    { node: 'intent.classify', phase: 'enter', seq: 3 },
    { node: 'intent.classify', phase: 'exit', seq: 4 },
    { node: 'context.gather', phase: 'enter', seq: 5 },
    { node: 'context.gather', phase: 'exit', seq: 6 },
    { node: 'answer.compose', phase: 'enter', seq: 7 },
    { node: 'answer.compose', phase: 'exit', seq: 8 }
  ],
  toolEvents: [
    { kind: 'result', tool: 'catalog.entity.get', ok: true, summary: 'Entity metadata loaded' },
    { kind: 'result', tool: 'observability.dashboard.list', ok: true, summary: '1 dashboard found' },
    { kind: 'result', tool: 'vcs.pull_request.list', ok: false, summary: 'Repository unavailable' }
  ]
};

/** Shows the progress heading before the first insight event arrives. */
export const Idle: Story = {
  args: noActivity
};

/** Shows active workflow nodes and in-flight context gathering. */
export const ActiveRun: Story = {
  args: activeRun
};

/** Shows completed workflow nodes with successful and failed tool results. */
export const CompletedRun: Story = {
  args: completedRun
};