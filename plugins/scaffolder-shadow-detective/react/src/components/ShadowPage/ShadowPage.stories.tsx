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
import { shadowDetectiveApiRef, type ShadowDetectiveApi } from '../../api';
import { SHADOW_RESOURCE_REPORT_ARTIFACT } from '../../hooks/useShadowScan';
import { ShadowPage } from './ShadowPage';
import type { AiRunEvent, ShadowResourceReport } from '../../@types';

const meta: Meta<typeof ShadowPage> = {
  title: 'Plugins/ScaffolderAiShadowDetective/ShadowPage',
  component: ShadowPage,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Standalone read-only shadow resource reconciliation page that reports cloud assets not currently bound to catalog ownership.'
      }
    }
  }
};
export default meta;
type Story = StoryObj<typeof ShadowPage>;

const report: ShadowResourceReport = {
  providers: ['aws', 'gcp'],
  scanned: 18,
  registered: 14,
  orphans: [
    {
      fingerprint: 'aws:rds:db-shadow-99',
      confidence: 'high',
      claimUrl: 'https://portal.example.test/create?asset=db-shadow-99',
      rationale: 'The owner tag matches the checkout platform group and the asset is not catalog-registered.',
      asset: {
        id: 'db-shadow-99',
        type: 'rds',
        provider: 'aws',
        region: 'us-east-1',
        evidence: ['asset-1']
      },
      hypotheses: [
        {
          id: 'owner-checkout',
          groupRef: 'group:default/team-checkout',
          basis: 'owner_tag',
          score: 0.98,
          evidence: ['tag-1']
        }
      ]
    },
    {
      fingerprint: 'gcp:storage:bucket-unbound',
      confidence: 'unknown',
      claimUrl: 'https://portal.example.test/create?asset=bucket-unbound',
      rationale: 'No catalog ownership evidence was found for this bucket.',
      asset: {
        id: 'bucket-unbound',
        type: 'storage-bucket',
        provider: 'gcp',
        evidence: ['asset-2']
      },
      hypotheses: []
    }
  ],
  suppressedCount: 1,
  status: 'report_only',
  limitations: ['Unconfigured cloud drivers are reported as limitations rather than failures.'],
  evidence: [
    {
      id: 'asset-1',
      source: 'cloud',
      summary: 'RDS inventory returned db-shadow-99 in us-east-1.',
      reference: 'aws://rds/us-east-1/db-shadow-99'
    },
    {
      id: 'tag-1',
      source: 'tag',
      summary: 'The asset has owner tag team-checkout.'
    }
  ]
};

const noOrphansReport: ShadowResourceReport = {
  ...report,
  scanned: 12,
  registered: 12,
  orphans: [],
  suppressedCount: 0,
  status: 'no_orphans',
  limitations: [],
  evidence: []
};

const stream = (...events: AiRunEvent[]) =>
  async function* (): AsyncGenerator<AiRunEvent> {
    yield* events;
  };

const reportEvent = (runId: string, value: ShadowResourceReport): AiRunEvent => ({
  type: 'artifact',
  data: { runId, kind: SHADOW_RESOURCE_REPORT_ARTIFACT, ref: JSON.stringify(value) }
});

const createStoryApi = (streamRunEvents = stream()): ShadowDetectiveApi =>
  createMockApi<ShadowDetectiveApi>({
    startScan: createMockFn(stream()),
    streamRunEvents: createMockFn(streamRunEvents)
  });

const withRun = (api: ShadowDetectiveApi, runId: string) => ({
  loaders: [async () => ({ mockApis: [[shadowDetectiveApiRef, api]] })],
  parameters: { backstage: { routeEntries: [`/?run=${runId}`] } }
});
/** Shows the untouched page with scan controls and no selected report. */
export const Idle: Story = {
  loaders: [async () => ({ mockApis: [[shadowDetectiveApiRef, createStoryApi()]] })],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Run scan' })).toBeEnabled();
    await expect(canvas.getByText('No run selected.')).toBeInTheDocument();
    await expect(canvas.getByText('Run a scan or open a saved report.')).toBeInTheDocument();
  }
};

/** Replays an in-progress scan while cloud inventory and catalog reconciliation are running. */
export const Scanning: Story = {
  ...withRun(
    createStoryApi(
      stream({
        type: 'step',
        data: { runId: 'run-shadow-scanning', seq: 1, node: 'inventory', phase: 'enter' }
      })
    ),
    'run-shadow-scanning'
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('enter: inventory')).toBeInTheDocument();
    await expect(canvas.getByTestId('progress')).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Run scan' })).toBeDisabled();
  }
};

/** Replays a report-only scan with high-confidence ownership evidence and an unknown orphan. */
export const OrphansFound: Story = {
  ...withRun(
    createStoryApi(
      stream(
        reportEvent('run-shadow-orphans', report),
        { type: 'done', data: { runId: 'run-shadow-orphans' } }
      )
    ),
    'run-shadow-orphans'
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.findByText('Shadow resource report')).resolves.toBeInTheDocument();
    await expect(canvas.getByText(/Status: report_only/)).toBeInTheDocument();
    await expect(canvas.getByText(/db-shadow-99 · aws · rds/)).toBeInTheDocument();
    await expect(canvas.getByText(/group:default\/team-checkout/)).toBeInTheDocument();
    await expect(canvas.getByText('Owner: unknown — no catalog-resolved evidence.')).toBeInTheDocument();
    await expect(canvas.getAllByRole('link', { name: 'Claim this resource' })).toHaveLength(2);
    await expect(canvas.getByRole('region', { name: 'Report limitations' })).toHaveTextContent(
      'does not send outreach or mutate cloud or catalog resources'
    );
  }
};

/** Shows a completed scan where every discovered cloud resource is catalog-registered. */
export const NoOrphans: Story = {
  ...withRun(
    createStoryApi(
      stream(reportEvent('run-shadow-clean', noOrphansReport), {
        type: 'done',
        data: { runId: 'run-shadow-clean' }
      })
    ),
    'run-shadow-clean'
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('No unbound resources were found.')).toBeInTheDocument();
    await expect(canvas.getByText(/Status: no_orphans/)).toBeInTheDocument();
  }
};

/** Displays a streamed scan failure while keeping the read-only scan action available. */
export const ScanError: Story = {
  ...withRun(
    createStoryApi(
      stream({
        type: 'error',
        data: { runId: 'run-shadow-error', message: 'Cloud inventory failed: provider credentials unavailable.' }
      })
    ),
    'run-shadow-error'
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('alert')).toHaveTextContent('provider credentials unavailable');
    await expect(canvas.getByRole('button', { name: 'Run scan' })).toBeEnabled();
  }
};

