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
import { techdocsJanitorApiRef, type TechdocsJanitorApi } from '../../api';
import { JANITOR_REPORT_ARTIFACT } from '../../hooks/useJanitorRun';
import type { AiRunEvent, JanitorReport } from '../../@types';
import { TechdocsJanitorPage } from './TechdocsJanitorPage';

const meta: Meta<typeof TechdocsJanitorPage> = {
  title: 'Plugins/TechdocsAiJanitor/TechdocsJanitorPage',
  component: TechdocsJanitorPage,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Standalone page for starting and replaying explicit-path, read-only TechDocs audits with source-ranged evidence.'
      }
    }
  }
};
export default meta;
type Story = StoryObj<typeof TechdocsJanitorPage>;

const report: JanitorReport = {
  entityRef: 'component:default/payments',
  repoUrl: 'https://github.com/acme/payments',
  ref: 'main',
  status: 'findings',
  discrepancies: [
    {
      id: 'disc-ownership',
      kind: 'ownership_drift',
      severity: 'high',
      message: 'The documented owner does not match the catalog owner.',
      range: {
        path: 'docs/index.md',
        startLine: 2,
        endLine: 2,
        excerpt: 'owner: team-alpha'
      },
      replacement: 'team-beta',
      evidence: ['catalog-owner']
    }
  ],
  limitations: ['No patch or documentation write was produced.'],
  evidence: [
    {
      id: 'catalog-owner',
      source: 'catalog',
      summary: 'Catalog owner is team-beta.',
      reference: 'component:default/payments'
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
  data: { runId, kind: JANITOR_REPORT_ARTIFACT, ref: JSON.stringify(report) }
});

const createStoryApi = (
  startAudit = stream(),
  streamRunEvents = stream(),
): TechdocsJanitorApi =>
  createMockApi<TechdocsJanitorApi>({
    startAudit: createMockFn(startAudit),
    streamRunEvents: createMockFn(streamRunEvents)
  });

const withApi = (api: TechdocsJanitorApi) => async () => ({
  mockApis: [[techdocsJanitorApiRef, api]]
});

const withRun = (api: TechdocsJanitorApi, runId: string) => ({
  loaders: [withApi(api)],
  parameters: { backstage: { routeEntries: [`/?run=${runId}`] } }
});

/** Shows the untouched page and opens the explicit-path audit dialog. */
export const Idle: Story = {
  loaders: [withApi(createStoryApi())],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Audit documentation' })).toBeEnabled();
    await expect(canvas.getByText('No audit selected.')).toBeInTheDocument();
    await expect(canvas.getByText(/Start an explicit-path audit/)).toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: 'Audit documentation' }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog).toBeVisible());
    await expect(within(dialog).getByRole('heading', { name: 'Audit TechDocs markdown' })).toBeInTheDocument();
  }
};

/** Replays an in-progress TechDocs audit while the janitor workflow is running. */
export const Auditing: Story = {
  ...withRun(
    createStoryApi(
      stream(),
      stream({
        type: 'step',
        data: { runId: 'run-janitor-auditing', seq: 1, node: 'detect-links', phase: 'enter' }
      })
    ),
    'run-janitor-auditing'
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('enter: detect-links')).toBeInTheDocument();
    await expect(canvas.getByTestId('progress')).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Audit documentation' })).toBeInTheDocument();
  }
};

/** Replays a completed audit with a source-ranged discrepancy and catalog evidence. */
export const AuditReady: Story = {
  ...withRun(
    createStoryApi(
      stream(),
      stream(
        { type: 'step', data: { runId: 'run-janitor-ready', seq: 1, node: 'report', phase: 'exit' } },
        reportEvent('run-janitor-ready'),
        { type: 'done', data: { runId: 'run-janitor-ready' } }
      )
    ),
    'run-janitor-ready'
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.findByText('TechDocs audit report')).resolves.toBeInTheDocument();
    await expect(canvas.getByText('exit: report')).toBeInTheDocument();
    await expect(canvas.getByText(/Status: findings/)).toBeInTheDocument();
    await expect(canvas.getByRole('region', { name: 'Documentation discrepancies' })).toHaveTextContent('docs/index.md:2-2');
    await expect(canvas.getByRole('region', { name: 'Documentation discrepancies' })).toHaveTextContent('Catalog-backed replacement: team-beta');
    await expect(canvas.getByRole('link', { name: 'Catalog owner is team-beta.' })).toHaveAttribute('href', 'component:default/payments');
  }
};

/** Displays an audit failure while keeping the documentation audit action available. */
export const AuditError: Story = {
  ...withRun(
    createStoryApi(
      stream(),
      stream({
        type: 'error',
        data: { runId: 'run-janitor-error', message: 'TechDocs audit failed: catalog resolver unavailable.' }
      })
    ),
    'run-janitor-error'
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('alert')).toHaveTextContent('catalog resolver unavailable');
    await expect(canvas.getByRole('button', { name: 'Audit documentation' })).toBeEnabled();
    await expect(canvas.getByText(/Start an explicit-path audit/)).toBeInTheDocument();
  }
};

