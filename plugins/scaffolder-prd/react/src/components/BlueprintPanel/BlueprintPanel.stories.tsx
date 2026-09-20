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
import { BlueprintPanel } from './BlueprintPanel';
import type { DeliveryBlueprint } from '../../@types';

const meta: Meta<typeof BlueprintPanel> = {
  title: 'Plugins/ScaffolderAiPrd/BlueprintPanel',
  component: BlueprintPanel,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Displays cited product, engineering, and technical-writing blueprint output without implying that tickets, tasks, or documentation writes are available.'
      }
    }
  }
};
export default meta;
type Story = StoryObj<typeof BlueprintPanel>;

const completeBlueprint: DeliveryBlueprint = {
  title: 'Payment gateway modernization',
  blueprintHash: 'blueprint-91af',
  readiness: 'complete',
  status: 'blueprint_only',
  epic: {
    title: 'Payment gateway modernization',
    description: 'Improve payment reliability and operational visibility.',
    evidence: ['prd-1']
  },
  stories: [
    {
      id: 'story-observability',
      title: 'Add payment gateway observability',
      description: 'Expose dashboards and alerts for payment failures.',
      evidence: ['prd-2']
    },
    {
      id: 'story-retry',
      title: 'Add configurable payment retries',
      description: 'Retry transient provider failures within policy limits.',
      evidence: ['prd-3']
    }
  ],
  template: {
    templateRef: 'template:default/react-service',
    score: 0.94,
    parameters: [
      {
        field: 'name',
        value: 'payment-gateway',
        origin: 'prd',
        evidence: ['prd-1']
      }
    ],
    issues: [],
    evidence: ['prd-1', 'template-1']
  },
  documentation: {
    files: [
      {
        path: 'docs/architecture.md',
        sections: ['Overview', 'Reliability model'],
        evidence: ['prd-1', 'prd-2']
      },
      {
        path: 'docs/operations.md',
        sections: ['Dashboards', 'Failure handling'],
        evidence: ['prd-2', 'prd-3']
      }
    ],
    evidence: ['prd-2']
  },
  openQuestions: [],
  limitations: ['The generated blueprint is advisory and remains read-only in this milestone.'],
  evidence: [
    {
      id: 'prd-1',
      source: 'prd',
      summary: 'The PRD defines the payment gateway modernization goal.'
    }
  ]
};

const incompleteBlueprint: DeliveryBlueprint = {
  title: 'Unresolved service request',
  blueprintHash: 'blueprint-404',
  readiness: 'partial',
  status: 'unparseable',
  stories: [],
  openQuestions: ['Which service should be created?'],
  limitations: ['The request did not contain enough structured product information.'],
  evidence: []
};

/** Displays all three blueprint channels with citations and generated documentation outlines. */
export const CompleteBlueprint: Story = {
  args: { blueprint: completeBlueprint },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Payment gateway modernization')).toBeInTheDocument();
    await expect(canvas.getByText('Status: blueprint_only · Readiness: complete')).toBeInTheDocument();
    await expect(canvas.getByRole('region', { name: 'Product manager channel' })).toHaveTextContent(
      'Add payment gateway observability'
    );
    await expect(canvas.getByRole('region', { name: 'Engineer channel' })).toHaveTextContent(
      'template:default/react-service'
    );
    await expect(canvas.getByRole('region', { name: 'Technical writer channel' })).toHaveTextContent(
      'docs/architecture.md'
    );
    await expect(canvas.getByRole('region', { name: 'Technical writer channel' })).toHaveTextContent(
      'Reliability model'
    );
    await expect(canvas.getByRole('region', { name: 'Blueprint limitations' })).toHaveTextContent(
      'does not approve or execute tickets, tasks, or documentation writes'
    );
  }
};

/** Shows the partial unparseable state when no epic, template, or documentation plan is available. */
export const IncompleteBlueprint: Story = {
  args: { blueprint: incompleteBlueprint },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Status: unparseable · Readiness: partial')).toBeInTheDocument();
    await expect(canvas.getByRole('region', { name: 'Engineer channel' })).toHaveTextContent(
      'No template plan.'
    );
    await expect(canvas.getByRole('region', { name: 'Blueprint limitations' })).toHaveTextContent(
      'The request did not contain enough structured product information.'
    );
    await expect(canvas.getByRole('region', { name: 'Blueprint limitations' })).toHaveTextContent(
      'does not approve or execute tickets, tasks, or documentation writes'
    );
  }
};
