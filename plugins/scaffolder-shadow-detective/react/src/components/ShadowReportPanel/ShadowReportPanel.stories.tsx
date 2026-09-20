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
import { ShadowReportPanel } from './ShadowReportPanel';
import type { ShadowResourceReport } from '../../@types';

const meta: Meta<typeof ShadowReportPanel> = {
  title: 'Plugins/ScaffolderAiShadowDetective/ShadowReportPanel',
  component: ShadowReportPanel,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Displays report-only cloud resources, catalog ownership hypotheses, human-click claim paths, and the limitations of the shadow reconciliation backend.'
      }
    }
  }
};
export default meta;
type Story = StoryObj<typeof ShadowReportPanel>;

const reportWithOrphans: ShadowResourceReport = {
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
    }
  ]
};

const noOrphansReport: ShadowResourceReport = {
  ...reportWithOrphans,
  scanned: 12,
  registered: 12,
  orphans: [],
  suppressedCount: 0,
  status: 'no_orphans',
  limitations: [],
  evidence: []
};

/** Displays verified and unknown ownership hypotheses with claim links and report-only limitations. */
export const OrphansPresent: Story = {
  args: { report: reportWithOrphans },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Shadow resource report')).toBeInTheDocument();
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

/** Shows the clean report state when all scanned resources are catalog-registered. */
export const NoOrphans: Story = {
  args: { report: noOrphansReport },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/Status: no_orphans/)).toBeInTheDocument();
    await expect(canvas.getByText('No unbound resources were found.')).toBeInTheDocument();
    await expect(canvas.getByRole('region', { name: 'Shadow resources' })).toBeInTheDocument();
    await expect(canvas.queryByRole('link', { name: 'Claim this resource' })).not.toBeInTheDocument();
  }
};
