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
import { expect, within } from 'storybook/test';
import { DebtReportPanel } from './DebtReportPanel';
import type { DebtReport } from '../../@types';

const meta: Meta<typeof DebtReportPanel> = {
  title: 'Plugins/TechDebtAiScout/DebtReportPanel',
  component: DebtReportPanel,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Displays deterministic repository scan outcomes, escalated and suppressed code-debt findings, retained evidence, and explicit read-only limitations.'
      }
    }
  }
};
export default meta;
type Story = StoryObj<typeof DebtReportPanel>;

const reportWithFindings: DebtReport = {
  scannedAt: '2026-01-15T12:00:00.000Z',
  targets: [
    { repoUrl: 'https://github.com/acme/payments', entityRef: 'component:default/payments', status: 'scanned', signalCount: 8 },
    { repoUrl: 'https://bitbucket.org/acme/legacy', status: 'search_unsupported', signalCount: 0, reason: 'Repository search is not supported by the configured provider.' }
  ],
  findings: [
    {
      signal: { id: 'signal-secret', kind: 'secret_literal', repoUrl: 'https://github.com/acme/payments', path: 'src/config.ts', line: 18, raw: 'API_KEY = [redacted]', evidence: ['signal-secret'] },
      fingerprint: 'fingerprint-secret', severity: 'critical', score: 9, reasons: ['secret_literal'], disposition: 'escalate', owner: 'group:default/security', summary: 'A secret-shaped literal was found in a source configuration file.', corroboration: ['policy-secret-handling']
    },
    {
      signal: { id: 'signal-todo', kind: 'marker', repoUrl: 'https://github.com/acme/payments', path: 'src/retry.ts', line: 44, raw: '// TODO: replace temporary retry behavior', markerTag: 'TODO', evidence: ['signal-todo'] },
      fingerprint: 'fingerprint-todo', severity: 'low', score: 1, reasons: ['marker_todo'], disposition: 'suppressed', summary: 'A low-priority TODO marker is retained for transparent tuning.', corroboration: []
    },
    {
      signal: { id: 'signal-dependency', kind: 'stale_dependency', repoUrl: 'https://github.com/acme/payments', path: 'package.json', raw: 'lodash: 3.0.0', evidence: ['signal-dependency'] },
      fingerprint: 'fingerprint-dependency', severity: 'medium', score: 4, reasons: ['dependency_stale'], disposition: 'already_tracked', summary: 'A stale dependency is already tracked in an existing ticket.', corroboration: ['ticket-184']
    }
  ],
  counts: { escalate: 1, suppressed: 1, alreadyTracked: 1 },
  bySeverity: { critical: 1, high: 0, medium: 1, low: 1 },
  byOwner: [{ owner: 'group:default/security', escalateCount: 1, highestSeverity: 'critical' }],
  status: 'partial',
  limitations: ['Repository search is unsupported for one configured target; zero findings is not clean.'],
  evidence: [
    { id: 'signal-secret', source: 'code', summary: 'Secret-shaped source signal in payments.', reference: 'https://github.com/acme/payments/blob/main/src/config.ts#L18' },
    { id: 'ticket-184', source: 'ticket', summary: 'Existing ticket tracks the stale dependency.' }
  ]
};
const cleanReport: DebtReport = {
  ...reportWithFindings,
  targets: [{ repoUrl: 'https://github.com/acme/payments', status: 'scanned', signalCount: 0 }],
  findings: [],
  counts: { escalate: 0, suppressed: 0, alreadyTracked: 0 },
  bySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
  byOwner: [],
  status: 'no_findings',
  limitations: [],
  evidence: []
};

/** Displays repository outcomes, escalated, suppressed, and already-tracked findings. */
export const FindingsPresent: Story = {
  args: { report: reportWithFindings },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Technical debt report')).toBeInTheDocument();
    await expect(canvas.getByText(/Status: partial/)).toBeInTheDocument();
    await expect(canvas.getByRole('region', { name: 'Repository outcomes' })).toHaveTextContent('search_unsupported');
    await expect(canvas.getByRole('region', { name: 'Escalated findings' })).toHaveTextContent('src/config.ts:18');
    await expect(canvas.getByRole('region', { name: 'Suppressed findings' })).toHaveTextContent('src/retry.ts:44');
    await expect(canvas.getByRole('region', { name: 'Evidence citations' })).toHaveTextContent('Existing ticket tracks the stale dependency.');
    await expect(canvas.getByRole('link', { name: 'Secret-shaped source signal in payments.' })).toHaveAttribute('href', 'https://github.com/acme/payments/blob/main/src/config.ts#L18');
    await expect(canvas.getByRole('region', { name: 'Report limitations' })).toHaveTextContent('zero findings is not clean');
  }
};

/** Shows the clean scan state with no escalation or suppression findings. */
export const NoFindings: Story = {
  args: { report: cleanReport },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('No findings met the escalation threshold.')).toBeInTheDocument();
    await expect(canvas.getByText('No findings were suppressed.')).toBeInTheDocument();
  }
};

