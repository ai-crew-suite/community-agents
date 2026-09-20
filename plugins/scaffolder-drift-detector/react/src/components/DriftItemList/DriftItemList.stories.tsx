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
import { DriftItemList } from './DriftItemList';
import type { DriftReport } from '../../@types';

const meta: Meta<typeof DriftItemList> = {
  title: 'Plugins/ScaffolderAiDriftDetector/DriftItemList',
  component: DriftItemList,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Per-field expected-versus-actual drift display with severity and the evidence identifiers supplied by the drift report.'
      }
    }
  }
};
export default meta;
type Story = StoryObj<typeof DriftItemList>;

const driftedReport: DriftReport = {
  entityRef: 'component:default/payments-api',
  status: 'drifted',
  items: [
    {
      id: 'replicas',
      field: 'spec.replicas',
      expected: { value: 3, evidence: ['blueprint-1'] },
      actual: { value: 1, evidence: ['live-1'] },
      severity: 'critical'
    },
    {
      id: 'image',
      field: 'container.image',
      expected: { value: 'ghcr.io/acme/payments-api:1.8.0', evidence: ['blueprint-1'] },
      actual: { value: 'ghcr.io/acme/payments-api:1.6.3', evidence: ['live-1'] },
      severity: 'major'
    },
    {
      id: 'cpu-limit',
      field: 'resources.limits.cpu',
      expected: { value: '500m', evidence: ['blueprint-1'] },
      actual: { value: undefined, evidence: ['live-1'] },
      severity: 'minor'
    },
    {
      id: 'memory-limit',
      field: 'resources.limits.memory',
      expected: { value: '512Mi', evidence: ['blueprint-1'] },
      actual: { value: '512Mi', evidence: ['live-1'] },
      severity: 'info'
    },
    {
      id: 'ready-pods',
      field: 'pods.ready',
      expected: { value: 3, evidence: ['blueprint-1'] },
      actual: { value: 2, evidence: ['live-2', 'live-3'] },
      severity: 'major'
    }
  ],
  limitations: [],
  evidence: []
};

const inSyncReport: DriftReport = {
  entityRef: 'component:default/checkout-api',
  status: 'in_sync',
  items: [],
  limitations: [],
  evidence: []
};

/** Displays multiple field comparisons, including every supported severity and field shape. */
export const DriftDetected: Story = {
  args: { report: driftedReport },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('region', { name: 'Drift items' })).toBeInTheDocument();
    await expect(canvas.getByText('spec.replicas · critical')).toBeInTheDocument();
    await expect(canvas.getAllByText('Expected: 3 [blueprint-1]')).toHaveLength(2);
    await expect(canvas.getByText('Actual: 2 [live-2, live-3]')).toBeInTheDocument();
    await expect(canvas.getByText('resources.limits.cpu · minor')).toBeInTheDocument();
    await expect(canvas.getByText('Actual: undefined [live-1]')).toBeInTheDocument();
  }
};

/** Shows the compliant empty state returned when a report contains no structural drift. */
export const InSync: Story = {
  args: { report: inSyncReport },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('No structural drift was detected.')).toBeInTheDocument();
  }
};
