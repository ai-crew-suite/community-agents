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
import { AlertTunerPage } from './AlertTunerPage';
import { createMockApi, createMockFn } from '@ai-crew-suite/cli/storybook/mocks';
import {
  alertTunerApiRef,
  type AlertTunerApi
} from '@ai-crew-suite/plugin-agent-alert-tuner-backend';
import type { AiRunEvent } from '../../@types';

const meta: Meta<typeof AlertTunerPage> = {
  title: 'Plugins/AgentCrewSuite/AlertTunerPage',
  component: AlertTunerPage,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: 'An exemplar page story with typed API mocks and route-driven streaming states.'
      }
    }
  }
};
export default meta;
type Story = StoryObj<typeof AlertTunerPage>;

const emptyEvents = async function* (): AsyncGenerator<AiRunEvent> {};

const proposal = {
  alertId: 'payments-api-high-error-rate',
  service: 'payments-api',
  status: 'noisy' as const,
  window: { from: '2026-02-01T00:00:00Z', to: '2026-02-15T00:00:00Z' },
  score: {
    samples: 42,
    autoResolveRatio: 0.86,
    medianSelfClearSeconds: 75,
    p90SelfClearSeconds: 210,
    pagedRatio: 0.09,
    verdict: 'noisy' as const
  },
  changes: [
    {
      field: 'threshold' as const,
      from: '5%',
      to: '8%',
      rationale: 'Reduces transient deployment-alert noise while retaining sustained error detection.'
    }
  ],
  patch: {
    path: 'alerts/payments-api.yaml',
    patchHash: '47cdd2',
    diff: '@@ -12,7 +12,7 @@\n- threshold: 5%\n+ threshold: 8%'
  },
  confidence: 'high' as const,
  limitations: ['The evaluation window excludes maintenance periods without incident records.'],
  evidence: [
    {
      id: 'alert-history-1',
      source: 'alert' as const,
      summary: '36 of 42 firings self-cleared within four minutes.'
    }
  ]
};

const runEvents = (...events: AiRunEvent[]) =>
  async function* (): AsyncGenerator<AiRunEvent> {
    yield* events;
  };

const createStoryApi = (streamRunEvents = emptyEvents): AlertTunerApi =>
  createMockApi<AlertTunerApi>({
    evaluateAlert: createMockFn(emptyEvents),
    streamRunEvents: createMockFn(streamRunEvents),
    submitApproval: createMockFn(emptyEvents)
  });

const withApi = (api: AlertTunerApi) => async () => ({
  mockApis: [[alertTunerApiRef, api]]
});

const withRun = (api: AlertTunerApi, runId: string) => ({
  loaders: [withApi(api)],
  parameters: { backstage: { routeEntries: [`/?run=${runId}`] } }
});

/** Fresh page state with an action-panel-visible API mock. */
export const DefaultIdle: Story = {
  loaders: [withApi(createStoryApi())],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Evaluate alert' }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog).toBeVisible());
  }
};

/** A stream that has started but not emitted its terminal `done` event. */
export const AgentRunning: Story = {
  ...withRun(
    createStoryApi(
      runEvents(
        { type: 'step', data: { runId: 'run-9921-xyz', seq: 1, node: 'collect-evidence', phase: 'enter' } },
        { type: 'tool_result', data: { runId: 'run-9921-xyz', tool: 'incident.alert.history', ok: true, summary: '42 firings found' } }
      )
    ),
    'run-9921-xyz'
  )
};

/** A completed evaluation with a reviewable proposal, evidence, and IaC diff. */
export const ProposalReady: Story = {
  ...withRun(
    createStoryApi(
      runEvents(
        { type: 'artifact', data: { runId: 'run-proposal-1', kind: 'alert-tuning-proposal', ref: JSON.stringify(proposal) } },
        { type: 'done', data: { runId: 'run-proposal-1' } }
      )
    ),
    'run-proposal-1'
  )
};

/** A proposal paused for the explicit human approval required before publication. */
export const ApprovalRequired: Story = {
  ...withRun(
    createStoryApi(
      runEvents(
        { type: 'artifact', data: { runId: 'run-approval-1', kind: 'alert-tuning-proposal', ref: JSON.stringify(proposal) } },
        { type: 'approval_request', data: { runId: 'run-approval-1', approvalId: 'approval-1', reason: 'Open an IaC pull request for the threshold change.', effect: 'write' } }
      )
    ),
    'run-approval-1'
  )
};

/** An error returned from the streamed evaluation. */
export const AgenticError: Story = {
  ...withRun(
    createStoryApi(
      runEvents({
        type: 'error',
        data: { runId: 'run-error-1', message: 'Failed to synthesize the IaC proposal: LLM token limit exceeded on gateway node-4.' }
      })
    ),
    'run-error-1'
  )
};
