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
import {
  oncallHandoverApiRef,
  type OncallHandoverApi
} from '../api';
import type { AiRunEvent, HandoverBrief } from '../@types';
import { HandoverPage } from './HandoverPage';

const meta: Meta<typeof HandoverPage> = {
  title: 'Plugins/OncallHandoverAssistant/HandoverPage',
  component: HandoverPage,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: 'Compiles and presents a cited, clustered handover brief for an incoming on-call shift.'
      }
    }
  }
};
export default meta;
type Story = StoryObj<typeof HandoverPage>;

const brief: HandoverBrief = {
  window: {
    start: '2026-02-14T16:00:00Z',
    end: '2026-02-15T08:00:00Z'
  },
  team: 'Payment Platform',
  incomingEngineer: 'Alex Morgan',
  currentOncall: 'Priya Shah',
  status: 'compiled',
  highlights: [
    {
      text: 'Payment API memory alerts increased during the overnight deployment.',
      severity: 'high',
      citations: ['sig-1']
    }
  ],
  activeIncidents: [
    {
      id: 'cluster-payments-memory',
      service: 'payments-api',
      title: 'Payments API memory pressure',
      count: 4,
      firstSeen: '2026-02-14T22:10:00Z',
      lastSeen: '2026-02-15T07:45:00Z',
      status: 'active',
      signals: ['sig-1', 'sig-2'],
      correlated: ['deploy-1842']
    }
  ],
  openTickets: [
    {
      key: 'PAY-1842',
      summary: 'Review payment API memory limit',
      status: 'In Progress',
      citation: 'ticket-1'
    }
  ],
  notableChanges: [
    {
      summary: 'Increased payment worker concurrency from 8 to 16.',
      citation: 'deploy-1842'
    }
  ],
  recommendedWatchItems: ['Watch payment API memory saturation during the next peak window.'],
  limitations: ['Deployment logs were unavailable for part of the handover window.'],
  signals: []
};

const stream = (...events: AiRunEvent[]) =>
  async function* (): AsyncGenerator<AiRunEvent> {
    yield* events;
  };

const runningStream = () =>
  async function* (): AsyncGenerator<AiRunEvent> {
    yield {
      type: 'step',
      data: { runId: 'run-running-1', seq: 1, node: 'collect-signals', phase: 'enter' }
    };
    await new Promise<void>(resolve => setTimeout(resolve, 1000));
    yield {
      type: 'tool_call',
      data: { runId: 'run-running-1', tool: 'incident.incident.list', args: {} }
    };
  };

const briefEvents = (runId: string) =>
  stream(
    { type: 'step', data: { runId, seq: 1, node: 'collect-signals', phase: 'enter' } },
    {
      type: 'tool_result',
      data: { runId, tool: 'incident.incident.list', ok: true, summary: '4 active incidents' }
    },
    { type: 'step', data: { runId, seq: 2, node: 'collect-signals', phase: 'exit' } },
    {
      type: 'artifact',
      data: { runId, kind: 'oncall-handover-brief', ref: JSON.stringify(brief) }
    },
    { type: 'done', data: { runId } }
  );

const apiFor = (
  compileBrief = stream(),
  streamRunEvents = stream()
): OncallHandoverApi =>
  createMockApi<OncallHandoverApi>({
    compileBrief: createMockFn(compileBrief),
    streamRunEvents: createMockFn(streamRunEvents)
  });

const withApi = (api: OncallHandoverApi) => async () => ({
  mockApis: [[oncallHandoverApiRef, api]]
});

const withRoute = (api: OncallHandoverApi, search = '') => ({
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

/** Shows the untouched handover page before a brief is compiled. */
export const Idle: Story = {
  ...withRoute(apiFor()),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Compile brief' })).toBeVisible();
    await expect(canvas.getByRole('heading', { name: 'Progress' })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: 'Compile brief' }));
    await expect(
      within(await waitForDialog()).getByRole('heading', { name: 'Compile handover brief' })
    ).toBeInTheDocument();
  }
};

/** Compiles a team brief and renders its clustered incidents, changes, and tickets. */
export const CompileBrief: Story = {
  ...withRoute(apiFor(briefEvents('run-brief-1'))),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Compile brief' }));
    const dialog = await waitForDialog();
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: 'Team or rotation' }),
      'Payment Platform'
    );
    await userEvent.clear(
      within(dialog).getByRole('spinbutton', { name: 'Trailing window (hours)' })
    );
    await userEvent.type(
      within(dialog).getByRole('spinbutton', { name: 'Trailing window (hours)' }),
      '16'
    );
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: 'Incoming engineer (optional)' }),
      'Alex Morgan'
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Compile' }));

    await expect(await canvas.findByText('Payments API memory pressure')).toBeInTheDocument();
    await expect(
      await canvas.findByText(/Increased payment worker concurrency from 8 to 16\./)
    ).toBeInTheDocument();
    await expect(await canvas.findByText(/Review payment API memory limit/)).toBeInTheDocument();
  }
};

/** Shows the live progress state while signal collection is still running. */
export const Compiling: Story = {
  ...withRoute(apiFor(runningStream())),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Compile brief' }));
    const dialog = await waitForDialog();
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: 'Team or rotation' }),
      'Payment Platform'
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Compile' }));
    await expect(await canvas.findByRole('status')).toHaveTextContent('Compiling handover brief');
    await expect(canvas.getByText('collect-signals · enter')).toBeInTheDocument();
  }
};

/** Replays a completed brief from a deep-linked run. */
export const ReplayedRun: Story = {
  ...withRoute(apiFor(undefined, briefEvents('run-replayed-1')), 'run=run-replayed-1'),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Payments API memory pressure')).toBeInTheDocument();
    await expect(canvas.getByRole('status')).toHaveTextContent('Handover brief ready');
  }
};

/** Shows an error emitted while compiling the handover brief. */
export const CompileError: Story = {
  ...withRoute(
    apiFor(
      stream({
        type: 'error',
        data: { runId: 'run-error-1', message: 'Incident service unavailable.' }
      })
    )
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Compile brief' }));
    const dialog = await waitForDialog();
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: 'Team or rotation' }),
      'SRE Primary'
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Compile' }));
    await expect(await canvas.findByText('Incident service unavailable.')).toBeInTheDocument();
  }
};