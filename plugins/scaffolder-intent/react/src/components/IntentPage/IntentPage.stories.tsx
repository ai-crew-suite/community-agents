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
import { expect, screen, userEvent, within } from 'storybook/test';
import { createMockApi, createMockFn } from '@ai-crew-suite/cli/storybook/mocks';
import { scaffolderIntentApiRef, type ScaffolderIntentApi } from '../../api';
import { TEMPLATE_INTENT_PROPOSAL_ARTIFACT } from '../../hooks/useIntentProposalRun';
import { IntentPage } from './IntentPage';
import type { AiRunEvent, ScaffolderIntentProposal } from '../../@types';

const meta: Meta<typeof IntentPage> = {
  title: 'Plugins/ScaffolderAiIntent/IntentPage',
  component: IntentPage,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Standalone schema-grounded intent page for submitting a provisioning request and reviewing the configured template proposal without creating a Scaffolder task.'
      }
    }
  }
};
export default meta;
type Story = StoryObj<typeof IntentPage>;

const stream = (...events: AiRunEvent[]) =>
  async function* (): AsyncGenerator<AiRunEvent> {
    yield* events;
  };

const proposal: ScaffolderIntentProposal = {
  utterance: 'Create a React app called payment-gateway.',
  sessionId: 'session-payment-gateway',
  status: 'proposed',
  selectedTemplate: 'template:default/react-service',
  candidates: [{ templateRef: 'template:default/react-service', score: 0.96, matchedOn: ['react', 'app'], evidence: ['template-1'] }],
  confidence: 'high',
  parameters: [
    { field: 'name', value: 'payment-gateway', origin: 'utterance', evidence: ['utterance-1'] },
    { field: 'owner', value: 'group:default/platform', origin: 'default', evidence: ['template-1'] }
  ],
  issues: [],
  turns: 1,
  limitations: ['This milestone proposes a template but does not create a Scaffolder task.'],
  evidence: [{ id: 'template-1', source: 'template', summary: 'The configured React service template declares the selected schema fields.', reference: 'catalog://template/default/react-service' }]
};

const noMatchProposal: ScaffolderIntentProposal = {
  ...proposal,
  utterance: 'Create an unsupported quantum database platform.',
  sessionId: 'session-no-match',
  status: 'no_template_match',
  selectedTemplate: undefined,
  candidates: [],
  parameters: [],
  limitations: [],
  evidence: []
};

const unparseableProposal: ScaffolderIntentProposal = {
  ...proposal,
  utterance: 'Please help.',
  sessionId: 'session-unparseable',
  status: 'unparseable',
  selectedTemplate: undefined,
  candidates: [],
  parameters: [],
  limitations: [],
  evidence: []
};

const createStoryApi = (streamRunEvents = stream()): ScaffolderIntentApi =>
  createMockApi<ScaffolderIntentApi>({
    submitIntent: createMockFn(stream()),
    streamRunEvents: createMockFn(streamRunEvents)
  });

const withRun = (api: ScaffolderIntentApi, runId: string) => ({
  loaders: [async () => ({ mockApis: [[scaffolderIntentApiRef, api]] })],
  parameters: { backstage: { routeEntries: [`/?run=${runId}`] } }
});

const proposalEvent = (runId: string, value: ScaffolderIntentProposal): AiRunEvent => ({
  type: 'artifact',
  data: { runId, kind: TEMPLATE_INTENT_PROPOSAL_ARTIFACT, ref: JSON.stringify(value) }
});
/** Shows the untouched page with its request form and no selected run. */
export const Idle: Story = {
  loaders: [async () => ({ mockApis: [[scaffolderIntentApiRef, createStoryApi()]] })],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('region', { name: 'Provisioning intent' })).toBeInTheDocument();
    await expect(canvas.getByText('No run selected.')).toBeInTheDocument();
    await expect(canvas.getByText('Submit one provisioning request or open a saved run.')).toBeInTheDocument();
    await userEvent.type(
      canvas.getByRole('textbox', { name: 'Provisioning request' }),
      'Create a React app called payment-gateway.'
    );
    await expect(canvas.getByRole('button', { name: 'Generate proposal' })).toBeEnabled();
  }
};

/** Replays a run while the intent graph is still selecting and validating a template. */
export const Generating: Story = {
  ...withRun(
    createStoryApi(
      stream({ type: 'step', data: { runId: 'run-generating', seq: 1, node: 'select-template', phase: 'enter' } })
    ),
    'run-generating'
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('enter: select-template')).toBeInTheDocument();
    await expect(canvas.getByTestId('progress')).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Generate proposal' })).toBeDisabled();
  }
};

/** Replays a completed proposal with a selected template, ranked candidate, and resolved parameters. */
export const Proposed: Story = {
  ...withRun(
    createStoryApi(
      stream(proposalEvent('run-proposed', proposal), { type: 'done', data: { runId: 'run-proposed' } })
    ),
    'run-proposed'
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.findByText('Template intent proposal')).resolves.toBeInTheDocument();
    await expect(canvas.getByText('Status: proposed · Confidence: high')).toBeInTheDocument();
    await expect(canvas.getByText('template:default/react-service · score 0.96 · matched on react, app')).toBeInTheDocument();
    await expect(canvas.getByText('name: payment-gateway · utterance')).toBeInTheDocument();
    await expect(canvas.getByText('This proposal does not create a Scaffolder task.')).toBeInTheDocument();
  }
};

/** Shows a completed request for which no configured template matched the intent. */
export const NoTemplateMatch: Story = {
  ...withRun(
    createStoryApi(
      stream(proposalEvent('run-no-match', noMatchProposal), { type: 'done', data: { runId: 'run-no-match' } })
    ),
    'run-no-match'
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Status: no_template_match · Confidence: high')).toBeInTheDocument();
    await expect(canvas.getByText('No configured template matched this request.')).toBeInTheDocument();
    await expect(canvas.getByText('No schema-declared parameters were resolved.')).toBeInTheDocument();
  }
};

/** Shows a completed request that lacked actionable provisioning facts. */
export const Unparseable: Story = {
  ...withRun(
    createStoryApi(
      stream(proposalEvent('run-unparseable', unparseableProposal), { type: 'done', data: { runId: 'run-unparseable' } })
    ),
    'run-unparseable'
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Status: unparseable · Confidence: high')).toBeInTheDocument();
    await expect(canvas.getByText('The request did not contain actionable provisioning facts.')).toBeInTheDocument();
  }
};

/** Displays a streamed evaluation error while retaining the request form. */
export const RunError: Story = {
  ...withRun(
    createStoryApi(
      stream({
        type: 'error',
        data: { runId: 'run-error', message: 'Template selection failed: intent service unavailable.' }
      })
    ),
    'run-error'
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('alert')).toHaveTextContent('intent service unavailable');
    await expect(canvas.getByRole('region', { name: 'Provisioning intent' })).toBeInTheDocument();
  }
};

