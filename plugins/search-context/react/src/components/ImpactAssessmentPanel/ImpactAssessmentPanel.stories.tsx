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
import { ImpactAssessmentPanel } from './ImpactAssessmentPanel';
import type { ImpactAssessment } from '../../@types';

const meta: Meta<typeof ImpactAssessmentPanel> = {
  title: 'Plugins/SearchAiContext/ImpactAssessmentPanel',
  component: ImpactAssessmentPanel,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Displays bounded catalog-consumer impact verification, owner routing, textual code matches, and explicit limitations distinguishing unknown from unaffected.'
      }
    }
  }
};
export default meta;
type Story = StoryObj<typeof ImpactAssessmentPanel>;

const completeAssessment: ImpactAssessment = {
  entityRef: 'component:default/payment-gateway',
  change: {
    kind: 'endpoint_removed',
    symbol: '/v1/charge',
    replacement: '/v2/charges'
  },
  status: 'partial',
  graphTruncated: true,
  consumers: [
    {
      entityRef: 'component:default/checkout',
      owner: 'group:default/payments',
      hop: 1,
      relationId: 'depends-on-checkout',
      repoUrl: 'https://github.com/acme/checkout',
      classification: 'impacted',
      severity: 'critical',
      matches: [
        {
          id: 'match-checkout-1',
          repoUrl: 'https://github.com/acme/checkout',
          path: 'src/client.ts',
          line: 42,
          snippet: 'client.post("/v1/charge", payload)',
          query: '/v1/charge'
        }
      ]
    },
    {
      entityRef: 'component:default/invoicing',
      owner: 'group:default/finance',
      hop: 2,
      relationId: 'depends-on-invoicing',
      classification: 'unknown',
      reason: 'search_failed',
      matches: []
    },
    {
      entityRef: 'component:default/reporting',
      owner: 'group:default/analytics',
      hop: 1,
      relationId: 'depends-on-reporting',
      repoUrl: 'https://github.com/acme/reporting',
      classification: 'unaffected',
      matches: []
    }
  ],
  counts: { impacted: 1, unaffected: 1, unknown: 1 },
  ownerRollups: [
    {
      owner: 'group:default/payments',
      impactedCount: 1,
      highestSeverity: 'critical',
      consumers: ['component:default/checkout']
    }
  ],
  limitations: ['Graph traversal was capped at the configured relation depth.']
};

const noConsumersAssessment: ImpactAssessment = {
  ...completeAssessment,
  entityRef: 'component:default/unused-api',
  status: 'no_consumers',
  graphTruncated: false,
  consumers: [],
  counts: { impacted: 0, unaffected: 0, unknown: 0 },
  ownerRollups: [],
  limitations: []
};

const outOfScopeAssessment: ImpactAssessment = {
  ...noConsumersAssessment,
  entityRef: 'component:default/private-api',
  status: 'out_of_scope',
  limitations: ['The source entity could not be read by the catalog resolver.']
};

/** Displays impacted, unknown, and unaffected consumers with owner rollups and code evidence. */
export const ConsumersPresent: Story = {
  args: { assessment: completeAssessment },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Impact assessment: component:default/payment-gateway')).toBeInTheDocument();
    await expect(canvas.getByText(/Status: partial/)).toBeInTheDocument();
    await expect(canvas.getByRole('status')).toHaveTextContent('Catalog traversal was truncated');
    await expect(canvas.getByRole('region', { name: 'Owner rollup' })).toHaveTextContent('group:default/payments');
    await expect(canvas.getByRole('region', { name: 'Consumer verification' })).toHaveTextContent('component:default/checkout');
    await expect(canvas.getByText('unknown: search failed')).toBeInTheDocument();
    await expect(canvas.getByText('unaffected')).toBeInTheDocument();
    await expect(canvas.getByRole('link', { name: 'src/client.ts:42' })).toHaveAttribute('href', 'https://github.com/acme/checkout');
    await expect(canvas.getByRole('region', { name: 'Assessment limitations' })).toHaveTextContent('Unknown is not unaffected.');
  }
};

/** Shows the bounded empty-consumer outcome and empty owner-rollup state. */
export const NoConsumers: Story = {
  args: { assessment: noConsumersAssessment },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/Status: no_consumers/)).toBeInTheDocument();
    await expect(canvas.getByText('No catalog consumers were found in the bounded relation set.')).toBeInTheDocument();
    await expect(canvas.getByText('No owners have confirmed textual references.')).toBeInTheDocument();
  }
};

/** Shows the out-of-scope result when the source entity is unavailable or unreadable. */
export const OutOfScope: Story = {
  args: { assessment: outOfScopeAssessment },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/Status: out_of_scope/)).toBeInTheDocument();
    await expect(canvas.getByText('The source entity is unavailable or not readable for this request.')).toBeInTheDocument();
  }
};
