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
import { techRadarApiRef, type TechRadarApi } from '../../api';
import { RADAR_ANALYSIS_ARTIFACT } from '../../hooks/useRadarAnalysisRun';
import type { AiRunEvent, RadarAnalysis } from '../../@types';
import { TechRadarPage } from './TechRadarPage';

const meta: Meta<typeof TechRadarPage> = {
  title: 'Plugins/TechRadarAiManager/TechRadarPage',
  component: TechRadarPage,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Standalone page for submitting and replaying scoped, read-only technology-radar adoption analyses.'
      }
    }
  }
};

export default meta;
type Story = StoryObj<typeof TechRadarPage>;

const analysis: RadarAnalysis = {
  radarSource: 'https://example.test/radar.json',
  scannedAt: '2026-01-01T00:00:00.000Z',
  coverage: { scanned: 2, unavailable: 1, failed: 0, total: 3 },
  metrics: [
    {
      technology: 'vite',
      repositoriesUsing: 2,
      repositoriesScanned: 2,
      ratio: 1,
      currentRing: 'assess',
      usingRepos: ['payments', 'checkout']
    }
  ],
  proposals: [
    {
      technology: 'vite',
      fromRing: 'assess',
      toRing: 'trial',
      quadrant: 'tools',
      triggeredBy: ['ratio'],
      metric: {
        technology: 'vite',
        repositoriesUsing: 2,
        repositoriesScanned: 2,
        ratio: 1,
        currentRing: 'assess',
        usingRepos: ['payments', 'checkout']
      },
      rationale: 'Vite is consistently declared across the scanned repositories.'
    }
  ],
  deprecations: [],
  duplicateCapabilities: [],
  executiveSummary: 'Vite adoption supports a trial ring transition.',
  status: 'analysis_only',
  limitations: ['One configured repository was unavailable during analysis.'],
  evidence: [
    {
      id: 'repo-vite',
      source: 'manifest',
      summary: 'Scanned manifests declare Vite directly.',
      reference: 'https://github.com/acme/payments/blob/main/package.json'
    }
  ]
};

const stream = (...events: AiRunEvent[]) => {
  async function* streamEvents(): AsyncGenerator<AiRunEvent> {
    yield* events;
  }
  return streamEvents;
};

const analysisEvent = (runId: string): AiRunEvent => ({
  type: 'artifact',
  data: { runId, kind: RADAR_ANALYSIS_ARTIFACT, ref: JSON.stringify(analysis) }
});

const createStoryApi = (
  startAnalysis = stream(),
  streamRunEvents = stream(),
): TechRadarApi =>
  createMockApi<TechRadarApi>({
    startAnalysis: createMockFn(startAnalysis),
    streamRunEvents: createMockFn(streamRunEvents)
  });

const withApi = (api: TechRadarApi) => async () => ({
  mockApis: [[techRadarApiRef, api]]
});

const withRun = (api: TechRadarApi, runId: string) => ({
  loaders: [withApi(api)],
  parameters: { backstage: { routeEntries: [`/?run=${runId}`] } }
});

/** Shows the untouched page and opens the repository analysis dialog. */
export const Idle: Story = {
  loaders: [withApi(createStoryApi())],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Analyze repository' })).toBeEnabled();
    await expect(canvas.getByText('No analysis selected.')).toBeInTheDocument();
    await expect(canvas.getByText(/Start a scoped repository analysis/)).toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: 'Analyze repository' }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog).toBeVisible());
    await expect(within(dialog).getByRole('heading', { name: 'Analyze repository technology adoption' })).toBeInTheDocument();
  }
};

/** Replays an in-progress radar analysis while the workflow is running. */
export const Analyzing: Story = {
  ...withRun(
    createStoryApi(
      stream(),
      stream({ type: 'step', data: { runId: 'run-radar-analyzing', seq: 1, node: 'scan-manifests', phase: 'enter' } })
    ),
    'run-radar-analyzing'
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('enter: scan-manifests')).toBeInTheDocument();
    await expect(canvas.getByTestId('progress')).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Analyze repository' })).toBeInTheDocument();
  }
};

/** Replays a completed analysis with adoption metrics, a proposal, and evidence. */
export const AnalysisReady: Story = {
  ...withRun(
    createStoryApi(
      stream(),
      stream(
        { type: 'step', data: { runId: 'run-radar-ready', seq: 1, node: 'propose', phase: 'exit' } },
        analysisEvent('run-radar-ready'),
        { type: 'done', data: { runId: 'run-radar-ready' } }
      )
    ),
    'run-radar-ready'
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.findByText('Technology radar analysis')).resolves.toBeInTheDocument();
    await expect(canvas.getByText('exit: propose')).toBeInTheDocument();
    await expect(canvas.getByText(/Status: analysis_only/)).toBeInTheDocument();
    await expect(canvas.getByRole('region', { name: 'Adoption metrics' })).toHaveTextContent('vite: 2/2 (100%)');
    await expect(canvas.getByRole('region', { name: 'Transition proposals' })).toHaveTextContent('vite: assess → trial');
    await expect(canvas.getByRole('link', { name: 'Scanned manifests declare Vite directly.' })).toHaveAttribute('href', 'https://github.com/acme/payments/blob/main/package.json');
  }
};

/** Displays an analysis failure while keeping the repository analysis action available. */
export const AnalysisError: Story = {
  ...withRun(
    createStoryApi(
      stream(),
      stream({ type: 'error', data: { runId: 'run-radar-error', message: 'Radar analysis failed: radar source unavailable.' } })
    ),
    'run-radar-error'
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('alert')).toHaveTextContent('radar source unavailable');
    await expect(canvas.getByRole('button', { name: 'Analyze repository' })).toBeEnabled();
    await expect(canvas.getByText(/Start a scoped repository analysis/)).toBeInTheDocument();
  }
};

