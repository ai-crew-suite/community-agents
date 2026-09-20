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
import { MutationOfferPanel } from './MutationOfferPanel';
import type { MutationOfferPanelProps } from './MutationOfferPanel';
import type { MutationProposal } from '../../@types';

const meta: Meta<typeof MutationOfferPanel> = {
  title: 'Plugins/ScaffolderAiGuardrailAgent/MutationOfferPanel',
  component: MutationOfferPanel,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Displays backend-supplied parameter alternatives, their projected estimate when available, and the policy rules each alternative resolves.'
      }
    }
  }
};
export default meta;
type Story = StoryObj<typeof MutationOfferPanel>;

const mutations: MutationProposal[] = [
  {
    id: 'instance-type-mutation',
    parameter: 'instanceType',
    from: 'db.m5.16xlarge',
    to: 'db.m5.large',
    resolves: ['approved-instance-types', 'cost-ceiling'],
    projectedAmount: 180,
    rationale: 'Moves the request to the approved production instance type.'
  },
  {
    id: 'region-mutation',
    parameter: 'region',
    from: 'us-east-1',
    to: 'us-west-2',
    resolves: ['regional-availability'],
    rationale: 'Uses the configured region with available capacity.'
  }
];

/** Displays configured alternatives with both projected-cost and no-projection variants. */
export const AlternativesAvailable: Story = {
  args: { mutations } satisfies MutationOfferPanelProps,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const panel = canvas.getByRole('region', { name: 'Policy-derived alternatives' });
    await expect(panel).toBeInTheDocument();
    await expect(canvas.getByText('instanceType: db.m5.16xlarge → db.m5.large')).toBeInTheDocument();
    await expect(canvas.getByText('Re-priced estimate: 180')).toBeInTheDocument();
    await expect(canvas.getByText('Resolves: approved-instance-types, cost-ceiling')).toBeInTheDocument();
    await expect(canvas.getByText('region: us-east-1 → us-west-2')).toBeInTheDocument();
    await expect(canvas.getByText('Resolves: regional-availability')).toBeInTheDocument();
  }
};

/** Shows the empty state when policy evaluation supplies no safe alternative. */
export const NoAlternative: Story = {
  args: { mutations: [] } satisfies MutationOfferPanelProps,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('region', { name: 'Policy-derived alternatives' })).toBeInTheDocument();
    await expect(canvas.getByText('No safe alternative is available.')).toBeInTheDocument();
  }
};
