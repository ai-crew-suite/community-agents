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
import { RadarAnalysisPanel } from './RadarAnalysisPanel';
import type { RadarAnalysis } from '../../@types';

const meta: Meta<typeof RadarAnalysisPanel> = {
  title: 'Plugins/TechRadarAiManager/RadarAnalysisPanel',
  component: RadarAnalysisPanel,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Displays cited direct-dependency adoption metrics and deterministic technology-radar transition proposals without submitting policy changes.'
      }
    }
  }
};
export default meta;
type Story = StoryObj<typeof RadarAnalysisPanel>;

const analysis: RadarAnalysis = {
  radarSource: 'https://example.test/radar.json',
  scannedAt: '2026-01-01T00:00:00.000Z',
  coverage: { scanned: 3, unavailable: 1, failed: 0, total: 4 },
  metrics: [
    {
      technology: 'vite',
      repositoriesUsing: 3,
      repositoriesScanned: 3,
      ratio: 1,
      currentRing: 'assess',
      usingRepos: ['payments', 'checkout', 'catalog']
    },
    {
      technology: 'webpack',
      repositoriesUsing: 1,
      repositoriesScanned: 3,
      ratio: 1 / 3,
      currentRing: 'hold',
      usingRepos: ['legacy']
    }
  ],
  proposals: [
    {
      technology: 'vite',
      fromRing: 'assess',
      toRing: 'trial',
      quadrant: 'tools',
      triggeredBy: ['ratio', 'coverage'],
      metric: {
        technology: 'vite',
        repositoriesUsing: 3,
        repositoriesScanned: 3,
        ratio: 1,
        currentRing: 'assess',
        usingRepos: ['payments', 'checkout', 'catalog']
      },
      rationale: 'Vite is declared across every scanned repository and is ready for a trial transition.'
    }
  ],
  deprecations: [
    { technology: 'webpack', ring: 'hold', affectedRepos: ['legacy'] }
  ],
  duplicateCapabilities: [],
  executiveSummary: 'Vite has broad direct-dependency adoption and one transition is recommended.',
  status: 'analysis_only',
  limitations: [
    'One configured repository was unavailable during the bounded scan.',
    'These recommendations are advisory and no radar proposal was submitted.'
  ],
  evidence: [
    {
      id: 'radar-1',
      source: 'radar',
      summary: 'The current technology radar places Vite in the assess ring.',
      reference: 'https://example.test/radar.json#vite'
    },
    {
      id: 'repo-vite',
      source: 'manifest',
      summary: 'Three scanned manifests declare Vite directly.'
    }
  ]
};

const noTransitions: RadarAnalysis = {
  ...analysis,
  coverage: { scanned: 2, unavailable: 0, failed: 0, total: 2 },
  metrics: [],
  proposals: [],
  deprecations: [],
  executiveSummary: 'No technology met the configured transition threshold.',
  status: 'partial',
  limitations: ['The scan completed, but no transition recommendation was produced.'],
  evidence: []
};

/** Displays coverage, adoption metrics, a deterministic proposal, limitations, and evidence. */
export const AnalysisReady: Story = {
  args: { analysis },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Technology radar analysis')).toBeInTheDocument();
    await expect(canvas.getByText(/Status: analysis_only/)).toBeInTheDocument();
    await expect(canvas.getByRole('region', { name: 'Coverage' })).toHaveTextContent('Scanned: 3');
    await expect(canvas.getByRole('region', { name: 'Adoption metrics' })).toHaveTextContent('vite: 3/3 (100%)');
    await expect(canvas.getByRole('region', { name: 'Adoption metrics' })).toHaveTextContent('webpack: 1/3 (33%)');
    await expect(canvas.getByRole('region', { name: 'Transition proposals' })).toHaveTextContent('vite: assess → trial');
    await expect(canvas.getByRole('region', { name: 'Analysis limitations' })).toHaveTextContent('unavailable during the bounded scan');
    await expect(canvas.getByRole('link', { name: 'The current technology radar places Vite in the assess ring.' })).toHaveAttribute('href', 'https://example.test/radar.json#vite');
  }
};

/** Shows the completed partial state when no technology meets the transition threshold. */
export const NoTransitions: Story = {
  args: { analysis: noTransitions },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/Status: partial/)).toBeInTheDocument();
    await expect(canvas.getByText('No technology met the configured transition threshold.')).toBeInTheDocument();
    await expect(canvas.getByRole('region', { name: 'Adoption metrics' })).toHaveTextContent('Declared direct-dependency adoption');
    await expect(canvas.getByRole('region', { name: 'Analysis limitations' })).toHaveTextContent('no transition recommendation');
  }
};
