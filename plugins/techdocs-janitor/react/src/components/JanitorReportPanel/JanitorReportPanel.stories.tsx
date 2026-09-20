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
import { JanitorReportPanel } from './JanitorReportPanel';
import type { JanitorReport } from '../../@types';

const meta: Meta<typeof JanitorReportPanel> = {
  title: 'Plugins/TechdocsAiJanitor/JanitorReportPanel',
  component: JanitorReportPanel,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Displays read-only TechDocs audit discrepancies, exact source ranges, catalog-backed replacement hints, limitations, and evidence citations.'
      }
    }
  }
};
export default meta;
type Story = StoryObj<typeof JanitorReportPanel>;

const reportWithFindings: JanitorReport = {
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
    },
    {
      id: 'disc-link',
      kind: 'dead_relative_link',
      severity: 'medium',
      message: 'The relative documentation link does not resolve at the pinned ref.',
      range: {
        path: 'docs/runbook.md',
        startLine: 18,
        endLine: 18,
        excerpt: '[deployment guide](./deploy.md)'
      },
      evidence: ['markdown-link']
    }
  ],
  limitations: ['No patch or documentation write was produced.'],
  evidence: [
    {
      id: 'catalog-owner',
      source: 'catalog',
      summary: 'Catalog owner is team-beta.',
      reference: 'component:default/payments'
    },
    {
      id: 'markdown-link',
      source: 'markdown',
      summary: 'Markdown link was inspected at docs/runbook.md:18.'
    }
  ]
};

const cleanReport: JanitorReport = {
  ...reportWithFindings,
  status: 'clean',
  discrepancies: [],
  limitations: [],
  evidence: []
};

/** Displays source-ranged documentation discrepancies, replacement guidance, limitations, and citations. */
export const FindingsPresent: Story = {
  args: { report: reportWithFindings },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('TechDocs audit report')).toBeInTheDocument();
    await expect(canvas.getByText(/Status: findings/)).toBeInTheDocument();
    await expect(canvas.getByRole('region', { name: 'Documentation discrepancies' })).toHaveTextContent('docs/index.md:2-2');
    await expect(canvas.getByRole('region', { name: 'Documentation discrepancies' })).toHaveTextContent('Catalog-backed replacement: team-beta');
    await expect(canvas.getByRole('region', { name: 'Documentation discrepancies' })).toHaveTextContent('docs/runbook.md:18-18');
    await expect(canvas.getByRole('region', { name: 'Audit limitations' })).toHaveTextContent('No patch or documentation write was produced.');
    await expect(canvas.getByRole('link', { name: 'Catalog owner is team-beta.' })).toHaveAttribute('href', 'component:default/payments');
    await expect(canvas.getByRole('region', { name: 'Evidence citations' })).toHaveTextContent('Markdown link was inspected');
  }
};

/** Shows a clean audit with no deterministic documentation discrepancies. */
export const Clean: Story = {
  args: { report: cleanReport },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/Status: clean/)).toBeInTheDocument();
    await expect(canvas.getByText('No deterministic discrepancies were found.')).toBeInTheDocument();
    await expect(canvas.getByRole('region', { name: 'Audit limitations' })).toBeInTheDocument();
  }
};
