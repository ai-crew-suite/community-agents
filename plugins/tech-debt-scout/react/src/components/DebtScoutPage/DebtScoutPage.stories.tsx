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
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, screen, userEvent, waitFor, within } from 'storybook/test';
import { createMockApi, createMockFn } from '@ai-crew-suite/cli/storybook/mocks';
import { techDebtScoutApiRef, type TechDebtScoutApi } from '../../api';
import { TECH_DEBT_REPORT_ARTIFACT } from '../../hooks/useDebtScoutRun';
import type { AiRunEvent, DebtReport } from '../../@types';
import { DebtScoutPage } from './DebtScoutPage';

const meta: Meta<typeof DebtScoutPage> = {
  title: 'Plugins/TechDebtAiScout/DebtScoutPage',
  component: DebtScoutPage,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Standalone read-only technical-debt scout page for submitting repository scans and replaying cited deterministic reports.'
      }
    }
  }
};
export default meta;
type Story = StoryObj<typeof DebtScoutPage>;

const report: DebtReport = {
  scannedAt: '2026-01-15T12:00:00.000Z',
  targets: [
    {
      repoUrl: 'https://github.com/acme/payments',
      entityRef: 'component:default/payments',
      status: 'scanned',
      signalCount: 2
    }
  ],
  findings: [
    {
      signal: {
        id: 'signal-secret',
        kind: 'secret_literal',
        repoUrl: 'https://github.com/acme/payments',
        path: 'src/config.ts',
        line: 18,
        raw: 'API_KEY = [redacted]',
        evidence: ['signal-secret']
      },
      fingerprint: 'fingerprint-secret',
      severity: 'critical',
      score: 9,
      reasons: ['secret_literal'],
      disposition: 'escalate',
      owner: 'group:default/security',
      summary: 'A secret-shaped literal was found in a source configuration file.',
      corroboration: []
    }
  ],
  counts: { escalate: 1, suppressed: 0, alreadyTracked: 0 },
  bySeverity: { critical: 1, high: 0, medium: 0, low: 0 },
  byOwner: [{ owner: 'group:default/security', escalateCount: 1, highestSeverity: 'critical' }],
  status: 'report_only',
  limitations: ['The scan is read-only and does not create tickets or modify source code.'],
  evidence: [
    {
      id: 'signal-secret',
      source: 'code',
      summary: 'Secret-shaped source signal in payments.',
      reference: 'https://github.com/acme/payments/blob/main/src/config.ts#L18'
    }
  ]
};

const stream = (...events: AiRunEvent[]) => {
  async function* streamEvents(): AsyncGenerator<AiRunEvent> {
    yield* events;
  }

  return streamEvents;
};

const reportEvent = (runId: string): AiRunEvent => ({
  type: 'artifact',
  data: { runId, kind: TECH_DEBT_REPORT_ARTIFACT, ref: JSON.stringify(report) }
});

const createStoryApi = (
  startScan = stream(),
  streamRunEvents = stream(),
): TechDebtScoutApi =>
  createMockApi<TechDebtScoutApi>({
    startScan: createMockFn(startScan),
    streamRunEvents: createMockFn(streamRunEvents),
  });

const withApi = (api: TechDebtScoutApi) => async () => ({
  mockApis: [[techDebtScoutApiRef, api]],
});

const withRun = (api: TechDebtScoutApi, runId: string) => ({
  loaders: [withApi(api)],
  parameters: { backstage: { routeEntries: [`/?run=${runId}`] } },
});

/** Fresh page state with no selected scan and an actionable scan dialog. */
export const DefaultIdle: Story = {
  loaders: [withApi(createStoryApi())],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('No scan selected.')).toBeInTheDocument();
    await expect(canvas.getByText(/Start a scoped repository scan/)).toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: 'Scan repository' }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog).toBeVisible());
    await expect(within(dialog).getByRole('heading', { name: 'Scan a repository for technical debt' })).toBeInTheDocument();
    await expect(within(dialog).getByRole('button', { name: 'Start scan' })).toBeDisabled();
  }
};

/** Replays an in-progress scan while the scout workflow is executing. */
export const Scanning: Story = {
  ...withRun(
    createStoryApi(
      stream(),
      stream({
        type: 'step',
        data: { runId: 'run-debt-scanning', seq: 1, node: 'scan', phase: 'enter' }
      })
    ),
    'run-debt-scanning'
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('enter: scan')).toBeInTheDocument();
    await expect(canvas.getByTestId('progress')).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Scan repository' })).toBeInTheDocument();
  }
};

/** Replays a completed cited report with an escalated technical-debt finding. */
export const ReportReady: Story = {
  ...withRun(
    createStoryApi(
      stream(),
      stream(
        { type: 'step', data: { runId: 'run-debt-ready', seq: 1, node: 'report', phase: 'exit' } },
        reportEvent('run-debt-ready'),
        { type: 'done', data: { runId: 'run-debt-ready' } }
      )
    ),
    'run-debt-ready'
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.findByText('Technical debt report')).resolves.toBeInTheDocument();
    await expect(canvas.getByText('exit: report')).toBeInTheDocument();
    await expect(canvas.getByText(/Status: report_only/)).toBeInTheDocument();
    await expect(canvas.getByRole('region', { name: 'Escalated findings' })).toHaveTextContent('src/config.ts:18');
    await expect(canvas.getByRole('region', { name: 'Evidence citations' })).toHaveTextContent('Secret-shaped source signal in payments.');
  }
};

/** Displays a streamed scan failure while keeping repository scanning available. */
export const ScanError: Story = {
  ...withRun(
    createStoryApi(
      stream(),
      stream({
        type: 'error',
        data: { runId: 'run-debt-error', message: 'Technical-debt scan failed: repository provider unavailable.' }
      })
    ),
    'run-debt-error'
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('alert')).toHaveTextContent('repository provider unavailable');
    await expect(canvas.getByRole('button', { name: 'Scan repository' })).toBeEnabled();
    await expect(canvas.getByText(/Start a scoped repository scan/)).toBeInTheDocument();
  }
};

