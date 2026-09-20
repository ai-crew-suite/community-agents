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
import { ViolationList } from './ViolationList';
import type { ViolationListProps } from './ViolationList';
import type { PolicyViolation } from '../../@types';

const meta: Meta<typeof ViolationList> = {
  title: 'Plugins/ScaffolderAiGuardrailAgent/ViolationList',
  component: ViolationList,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Renders deterministic policy violations with their severity, user-facing explanation, and retained evidence identifiers.'
      }
    }
  }
};
export default meta;
type Story = StoryObj<typeof ViolationList>;

const violations: PolicyViolation[] = [
  {
    id: 'instance-type-policy',
    policyId: 'approved-instance-types',
    rule: 'approved-instance-types',
    message: 'The requested instance type is larger than the approved production baseline.',
    parameter: 'instanceType',
    severity: 'negotiable',
    evidence: ['policy-1', 'catalog-1']
  },
  {
    id: 'region-policy',
    rule: 'regional-availability',
    message: 'The selected region is not available for this template in production.',
    severity: 'blocking',
    evidence: ['policy-2']
  },
  {
    id: 'tag-policy',
    policyId: 'required-cost-tags',
    rule: 'required-cost-tags',
    message: 'The request is missing an optional cost-center tag.',
    severity: 'advisory',
    evidence: ['policy-3', 'catalog-2']
  }
];

/** Displays multiple policy outcomes with all supported severities and citation shapes. */
export const ViolationsPresent: Story = {
  args: { violations } satisfies ViolationListProps,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const list = canvas.getByRole('region', { name: 'Policy violations' });
    await expect(list).toBeInTheDocument();
    await expect(canvas.getByText('approved-instance-types · negotiable')).toBeInTheDocument();
    await expect(
      canvas.getByText('The requested instance type is larger than the approved production baseline.')
    ).toBeInTheDocument();
    await expect(canvas.getByText('Cites: policy-1, catalog-1')).toBeInTheDocument();
    await expect(canvas.getByText('regional-availability · blocking')).toBeInTheDocument();
    await expect(canvas.getByText('required-cost-tags · advisory')).toBeInTheDocument();
    await expect(canvas.getByText('Cites: policy-3, catalog-2')).toBeInTheDocument();
  }
};

/** Shows the compliant empty state when policy evaluation reports no violations. */
export const NoViolations: Story = {
  args: { violations: [] } satisfies ViolationListProps,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('region', { name: 'Policy violations' })).toBeInTheDocument();
    await expect(canvas.getByText('No policy violations were reported.')).toBeInTheDocument();
  }
};
