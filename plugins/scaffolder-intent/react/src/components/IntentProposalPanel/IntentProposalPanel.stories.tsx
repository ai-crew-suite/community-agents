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
import { IntentProposalPanel } from './IntentProposalPanel';
import type { ScaffolderIntentProposal } from '../../@types';

const meta: Meta<typeof IntentProposalPanel> = {
  title: 'Plugins/ScaffolderAiIntent/IntentProposalPanel',
  component: IntentProposalPanel,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Displays schema-grounded template candidates, resolved parameters, validation issues, and the limitations of the proposal-only backend milestone.'
      }
    }
  }
};
export default meta;
type Story = StoryObj<typeof IntentProposalPanel>;

const proposed: ScaffolderIntentProposal = {
  utterance: 'Create a React app called payment-gateway.',
  sessionId: 'session-payment-gateway',
  status: 'proposed',
  selectedTemplate: 'template:default/react-service',
  candidates: [
    {
      templateRef: 'template:default/react-service',
      score: 0.96,
      matchedOn: ['react', 'app'],
      evidence: ['template-1']
    }
  ],
  confidence: 'high',
  parameters: [
    { field: 'name', value: 'payment-gateway', origin: 'utterance', evidence: ['utterance-1'] },
    { field: 'owner', value: 'group:default/platform', origin: 'default', evidence: ['template-1'] }
  ],
  issues: [],
  turns: 1,
  limitations: ['Template execution is intentionally unavailable in this proposal-only milestone.'],
  evidence: []
};

const awaitingCorrection: ScaffolderIntentProposal = {
  ...proposed,
  status: 'awaiting_correction',
  confidence: 'low',
  turns: 2,
  issues: [
    {
      id: 'name-taken',
      field: 'name',
      kind: 'name_taken',
      message: 'Component name is already registered in the catalog.',
      blocking: true,
      question: 'What alternative component name should I use?',
      evidence: ['catalog-1']
    },
    {
      id: 'owner-advisory',
      field: 'owner',
      kind: 'missing_field',
      message: 'No owner was explicitly provided in the request.',
      blocking: false,
      evidence: ['template-1']
    }
  ]
};

const noTemplateMatch: ScaffolderIntentProposal = {
  ...proposed,
  utterance: 'Create an unsupported quantum database platform.',
  sessionId: 'session-no-match',
  status: 'no_template_match',
  selectedTemplate: undefined,
  candidates: [],
  parameters: [],
  limitations: [],
  evidence: []
};

const unparseable: ScaffolderIntentProposal = {
  ...proposed,
  utterance: 'Please help.',
  sessionId: 'session-unparseable',
  status: 'unparseable',
  selectedTemplate: undefined,
  candidates: [],
  parameters: [],
  limitations: [],
  evidence: []
};

/** Displays a selected template, ranked candidate, resolved parameters, and proposal-only limitation. */
export const Proposed: Story = {
  args: { proposal: proposed },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Template intent proposal')).toBeInTheDocument();
    await expect(canvas.getByText('Status: proposed · Confidence: high')).toBeInTheDocument();
    await expect(canvas.getByRole('region', { name: 'Template candidates' })).toHaveTextContent(
      'template:default/react-service'
    );
    await expect(canvas.getByRole('region', { name: 'Resolved parameters' })).toHaveTextContent(
      'name: payment-gateway · utterance'
    );
    await expect(canvas.getByText('This proposal does not create a Scaffolder task.')).toBeInTheDocument();
  }
};

/** Shows a blocking correction question and the informational correction limitation. */
export const AwaitingCorrection: Story = {
  args: { proposal: awaitingCorrection },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Status: awaiting_correction · Confidence: low')).toBeInTheDocument();
    await expect(canvas.getByRole('status')).toHaveTextContent('does not yet accept correction turns');
    await expect(canvas.getByText('Component name is already registered in the catalog.')).toBeInTheDocument();
    await expect(canvas.getByText('Requested correction: What alternative component name should I use?')).toBeInTheDocument();
    await expect(canvas.getByText('advisory')).toBeInTheDocument();
  }
};

/** Communicates that the backend found no configured template for the request. */
export const NoTemplateMatch: Story = {
  args: { proposal: noTemplateMatch },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('No configured template matched this request.')).toBeInTheDocument();
    await expect(canvas.getByText('No schema-declared parameters were resolved.')).toBeInTheDocument();
    await expect(canvas.getByText('No validation issues were reported.')).toBeInTheDocument();
  }
};

/** Communicates that the request lacked actionable provisioning facts. */
export const Unparseable: Story = {
  args: { proposal: unparseable },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('The request did not contain actionable provisioning facts.')).toBeInTheDocument();
    await expect(canvas.queryByText('No configured template matched this request.')).not.toBeInTheDocument();
  }
};
