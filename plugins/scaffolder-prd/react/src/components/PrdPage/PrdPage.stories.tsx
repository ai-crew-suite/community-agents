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
import { scaffolderPrdApiRef, type ScaffolderPrdApi } from '../../api';
import { DELIVERY_BLUEPRINT_ARTIFACT } from '../../hooks/usePrdRun';
import { PrdPage } from './PrdPage';
import type { AiRunEvent, DeliveryBlueprint } from '../../@types';

const meta: Meta<typeof PrdPage> = {
  title: 'Plugins/ScaffolderAiPrd/PrdPage',
  component: PrdPage,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Standalone PRD translation page that produces a cited, blueprint-only delivery plan without approval or external writes.'
      }
    }
  }
};
export default meta;
type Story = StoryObj<typeof PrdPage>;

const blueprint: DeliveryBlueprint = {
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
      { field: 'name', value: 'payment-gateway', origin: 'prd', evidence: ['prd-1'] }
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
      }
    ],
    evidence: ['prd-2']
  },
  openQuestions: [],
  limitations: ['The generated blueprint is advisory and remains read-only in this milestone.'],
  evidence: [
    { id: 'prd-1', source: 'prd', summary: 'The PRD defines the payment gateway modernization goal.' }
  ]
};

const unparseableBlueprint: DeliveryBlueprint = {
  title: 'Unresolved product request',
  blueprintHash: 'blueprint-404',
  readiness: 'partial',
  status: 'unparseable',
  stories: [],
  openQuestions: ['Which product capability should be planned?'],
  limitations: ['The PRD did not contain enough actionable product information.'],
  evidence: []
};

const stream = (...events: AiRunEvent[]) =>
  async function* (): AsyncGenerator<AiRunEvent> {
    yield* events;
  };

const createStoryApi = (streamRunEvents = stream()): ScaffolderPrdApi =>
  createMockApi<ScaffolderPrdApi>({
    submitPrd: createMockFn(stream()),
    streamRunEvents: createMockFn(streamRunEvents)
  });

const withRun = (api: ScaffolderPrdApi, runId: string) => ({
  loaders: [async () => ({ mockApis: [[scaffolderPrdApiRef, api]] })],
  parameters: { backstage: { routeEntries: [`/?run=${runId}`] } }
});

const blueprintEvent = (runId: string, value: DeliveryBlueprint): AiRunEvent => ({
  type: 'artifact',
  data: { runId, kind: DELIVERY_BLUEPRINT_ARTIFACT, ref: JSON.stringify(value) }
});
/** Shows the empty PRD input and the page's blueprint-only messaging. */
export const Idle: Story = {
  loaders: [async () => ({ mockApis: [[scaffolderPrdApiRef, createStoryApi()]] })],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'PRD delivery blueprint' })).toBeInTheDocument();
    await expect(canvas.getByRole('textbox', { name: 'Product requirements document' })).toHaveValue('');
    await expect(canvas.getByRole('button', { name: 'Generate blueprint' })).toBeDisabled();
    await expect(canvas.getByText('No run selected.')).toBeInTheDocument();
    await expect(canvas.getByText('Paste one PRD or open a saved run.')).toBeInTheDocument();
  }
};

/** Replays an in-progress PRD run while its parallel channels are executing. */
export const Generating: Story = {
  ...withRun(
    createStoryApi(
      stream(
        { type: 'step', data: { runId: 'run-prd-generating', seq: 1, node: 'product-manager', phase: 'enter' } },
        { type: 'step', data: { runId: 'run-prd-generating', seq: 2, node: 'engineer', phase: 'enter' } }
      )
    ),
    'run-prd-generating'
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('product-manager: enter')).toBeInTheDocument();
    await expect(canvas.getByText('engineer: enter')).toBeInTheDocument();
    await expect(canvas.getByTestId('progress')).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Generate blueprint' })).toBeDisabled();
  }
};

/** Replays a completed PRD run with its cited product, engineering, and documentation blueprint. */
export const BlueprintReady: Story = {
  ...withRun(
    createStoryApi(
      stream(
        blueprintEvent('run-prd-ready', blueprint),
        { type: 'done', data: { runId: 'run-prd-ready' } }
      )
    ),
    'run-prd-ready'
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.findByText('Payment gateway modernization')).resolves.toBeInTheDocument();
    await expect(canvas.getByText('Status: blueprint_only · Readiness: complete')).toBeInTheDocument();
    await expect(canvas.getByRole('region', { name: 'Product manager channel' })).toHaveTextContent('Add payment gateway observability');
    await expect(canvas.getByRole('region', { name: 'Engineer channel' })).toHaveTextContent('template:default/react-service');
    await expect(canvas.getByRole('region', { name: 'Technical writer channel' })).toHaveTextContent('docs/architecture.md');
    await expect(canvas.getByText(/does not approve or execute tickets, tasks, or documentation writes/)).toBeInTheDocument();
  }
};

/** Shows a completed but unparseable PRD result with partial-readiness limitations. */
export const Unparseable: Story = {
  ...withRun(
    createStoryApi(
      stream(
        blueprintEvent('run-prd-unparseable', unparseableBlueprint),
        { type: 'done', data: { runId: 'run-prd-unparseable' } }
      )
    ),
    'run-prd-unparseable'
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/Status:\s*unparseable\s*·\s*Readiness:\s*partial/)).toBeInTheDocument();
    await expect(canvas.getByRole('region', { name: 'Engineer channel' })).toHaveTextContent('No template plan.');
    await expect(canvas.getByRole('region', { name: 'Blueprint limitations' })).toHaveTextContent('not contain enough actionable product information');
  }
};

/** Displays a streamed PRD processing failure while keeping the input form available. */
export const RunError: Story = {
  ...withRun(
    createStoryApi(
      stream({
        type: 'error',
        data: { runId: 'run-prd-error', message: 'PRD translation failed: blueprint service unavailable.' }
      })
    ),
    'run-prd-error'
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('alert')).toHaveTextContent('blueprint service unavailable');
    await expect(canvas.getByRole('textbox', { name: 'Product requirements document' })).toBeInTheDocument();
  }
};

