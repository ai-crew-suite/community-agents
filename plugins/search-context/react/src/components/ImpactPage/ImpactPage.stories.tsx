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
import { expect, screen, userEvent, waitFor, within } from 'storybook/test';
import { createMockApi, createMockFn } from '@ai-crew-suite/cli/storybook/mocks';
import { searchContextApiRef, type SearchContextApi } from '../../api';
import { IMPACT_ASSESSMENT_ARTIFACT } from '../../hooks/useImpactAssessmentRun';
import { ImpactPage } from './ImpactPage';
import type { AiRunEvent, ImpactAssessment } from '../../@types';

const meta: Meta<typeof ImpactPage> = {
  title: 'Plugins/SearchAiContext/ImpactPage',
  component: ImpactPage,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Standalone bounded source-change impact assessment page that combines catalog relationship hypotheses with textual repository evidence.'
      }
    }
  }
};
export default meta;
type Story = StoryObj<typeof ImpactPage>;

const assessment: ImpactAssessment = {
  entityRef: 'component:default/payment-gateway',
  change: { kind: 'endpoint_removed', symbol: '/v1/charge', replacement: '/v2/charges' },
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
          id: 'match-1',
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

const noConsumers: ImpactAssessment = {
  ...assessment,
  entityRef: 'component:default/unused-api',
  status: 'no_consumers',
  graphTruncated: false,
  consumers: [],
  counts: { impacted: 0, unaffected: 0, unknown: 0 },
  ownerRollups: [],
  limitations: []
};

const outOfScope: ImpactAssessment = {
  ...noConsumers,
  entityRef: 'component:default/private-api',
  status: 'out_of_scope',
  limitations: ['The source entity could not be read by the catalog resolver.']
};

const stream = (...events: AiRunEvent[]) =>
  async function* (): AsyncGenerator<AiRunEvent> {
    yield* events;
  };

const assessmentEvent = (runId: string, value: ImpactAssessment): AiRunEvent => ({
  type: 'artifact',
  data: { runId, kind: IMPACT_ASSESSMENT_ARTIFACT, ref: JSON.stringify(value) }
});

const createStoryApi = (streamRunEvents = stream()): SearchContextApi =>
  createMockApi<SearchContextApi>({
    startAssessment: createMockFn(stream()),
    streamRunEvents: createMockFn(streamRunEvents)
  });

const withRun = (api: SearchContextApi, runId: string) => ({
  loaders: [async () => ({ mockApis: [[searchContextApiRef, api]] })],
  parameters: { backstage: { routeEntries: [`/?run=${runId}`] } }
});
/** Shows the untouched page and opens the source-change assessment dialog. */
export const Idle: Story = {
  loaders: [async () => ({ mockApis: [[searchContextApiRef, createStoryApi()]] })],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Assess a change' })).toBeEnabled();
    await expect(canvas.getByText('No run selected.')).toBeInTheDocument();
    await expect(canvas.getByText(/Start a scoped assessment or open a saved run/)).toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: 'Assess a change' }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog).toBeVisible());
    await expect(screen.getByRole('heading', { name: 'Assess a source change' })).toBeInTheDocument();
  }
};

/** Replays an in-progress assessment while catalog traversal is running. */
export const Assessing: Story = {
  ...withRun(
    createStoryApi(
      stream({ type: 'step', data: { runId: 'run-impact-assessing', seq: 1, node: 'catalog-traverse', phase: 'enter' } })
    ),
    'run-impact-assessing'
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('enter: catalog-traverse')).toBeInTheDocument();
    await expect(canvas.getByTestId('progress')).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Assess a change' })).toBeInTheDocument();
  }
};

/** Replays a partial assessment with impacted, unknown, and unaffected consumers. */
export const AssessmentReady: Story = {
  ...withRun(
    createStoryApi(
      stream(
        assessmentEvent('run-impact-ready', assessment),
        { type: 'done', data: { runId: 'run-impact-ready' } }
      )
    ),
    'run-impact-ready'
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.findByText('Impact assessment: component:default/payment-gateway')).resolves.toBeInTheDocument();
    await expect(canvas.getByText(/Status: partial/)).toBeInTheDocument();
    await expect(canvas.getByRole('region', { name: 'Consumer verification' })).toHaveTextContent('component:default/checkout');
    await expect(canvas.getByText('unknown: search failed')).toBeInTheDocument();
    await expect(canvas.getByRole('region', { name: 'Owner rollup' })).toHaveTextContent('group:default/payments');
    await expect(canvas.getByRole('link', { name: 'src/client.ts:42' })).toHaveAttribute('href', 'https://github.com/acme/checkout');
  }
};

/** Shows a completed assessment with no catalog consumers in the bounded relation graph. */
export const NoConsumers: Story = {
  ...withRun(
    createStoryApi(
      stream(assessmentEvent('run-impact-empty', noConsumers), { type: 'done', data: { runId: 'run-impact-empty' } })
    ),
    'run-impact-empty'
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('No catalog consumers were found in the bounded relation set.')).toBeInTheDocument();
    await expect(canvas.getByText('No owners have confirmed textual references.')).toBeInTheDocument();
  }
};

/** Shows an out-of-scope assessment when the source entity cannot be read. */
export const OutOfScope: Story = {
  ...withRun(
    createStoryApi(
      stream(assessmentEvent('run-impact-scope', outOfScope), { type: 'done', data: { runId: 'run-impact-scope' } })
    ),
    'run-impact-scope'
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('The source entity is unavailable or not readable for this request.')).toBeInTheDocument();
  }
};

/** Displays an assessment failure while keeping the assessment action available. */
export const AssessmentError: Story = {
  ...withRun(
    createStoryApi(
      stream({
        type: 'error',
        data: { runId: 'run-impact-error', message: 'Impact assessment failed: catalog resolver unavailable.' }
      })
    ),
    'run-impact-error'
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('alert')).toHaveTextContent('catalog resolver unavailable');
    await expect(canvas.getByRole('button', { name: 'Assess a change' })).toBeEnabled();
  }
};

