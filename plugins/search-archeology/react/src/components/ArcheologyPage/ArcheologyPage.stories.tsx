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
import { searchArcheologyApiRef, type SearchArcheologyApi } from '../../api';
import { EXPERTISE_MATRIX_ARTIFACT } from '../../hooks/useArcheologyRun';
import { ArcheologyPage } from './ArcheologyPage';
import type { AiRunEvent, ExpertiseMatrix } from '../../@types';

const meta: Meta<typeof ArcheologyPage> = {
  title: 'Plugins/SearchAiArcheology/ArcheologyPage',
  component: ArcheologyPage,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Standalone read-only ticket-triage research page that presents cited historical familiarity evidence without assessing performance or contacting people.'
      }
    }
  }
};
export default meta;
type Story = StoryObj<typeof ArcheologyPage>;

const matrix: ExpertiseMatrix = {
  question: 'Who has triaged payment-reconciliation incidents?',
  scope: {
    question: 'Who has triaged payment-reconciliation incidents?',
    entityRef: 'component:default/payment-gateway',
    repoUrl: 'https://github.com/acme/payment-gateway',
    paths: ['services/reconciliation'],
    era: { since: '2024-01-01T00:00:00.000Z', until: '2025-01-01T00:00:00.000Z' }
  },
  status: 'complete',
  experts: [
    {
      identity: {
        actor: { id: 'alice', displayName: 'Alice Chen' },
        status: 'active',
        userRef: 'user:default/alice',
        displayName: 'Alice Chen',
        groupRefs: ['group:default/team-payments'],
        evidence: ['identity-1']
      },
      score: 0.91,
      signals: { authored: 3, reviewed: 8, triaged: 12, recencyMonths: 4 },
      rationale: 'Frequent ticket triage on payment-reconciliation incidents in the requested era.',
      evidence: ['ticket-1', 'ticket-2']
    }
  ],
  offboardedContributors: [
    {
      identity: {
        actor: { id: 'former-engineer', displayName: 'Former Engineer' },
        status: 'offboarded',
        groupRefs: [],
        evidence: []
      },
      score: 0.62,
      signals: { authored: 1, reviewed: 2, triaged: 5 },
      rationale: 'Historical triage activity is retained, but the identity is no longer active.',
      evidence: ['ticket-3']
    }
  ],
  narrative: 'Ticket-triage evidence identifies one active candidate and one explicitly offboarded contributor.',
  confidence: 'high',
  limitations: ['Commit history and review participation are outside the current provider contract.'],
  evidence: [
    {
      id: 'ticket-1',
      source: 'ticket',
      summary: 'Alice Chen triaged payment incident PAY-184.',
      reference: 'https://tickets.example.test/PAY-184'
    },
    { id: 'ticket-3', source: 'ticket', summary: 'Former Engineer triaged payment incident PAY-091.' }
  ]
};

const partialMatrix: ExpertiseMatrix = {
  ...matrix,
  question: 'Who knows the legacy settlement worker?',
  scope: { ...matrix.scope, question: 'Who knows the legacy settlement worker?', paths: [] },
  status: 'inconclusive',
  experts: [],
  offboardedContributors: [],
  confidence: 'low',
  narrative: 'The available ticket evidence was insufficient to identify an active contributor.',
  limitations: ['No catalog entity or repository scope was available for this request.'],
  evidence: []
};

const stream = (...events: AiRunEvent[]) =>
  async function* (): AsyncGenerator<AiRunEvent> {
    yield* events;
  };

const matrixEvent = (runId: string, value: ExpertiseMatrix): AiRunEvent => ({
  type: 'artifact',
  data: { runId, kind: EXPERTISE_MATRIX_ARTIFACT, ref: JSON.stringify(value) }
});

const createStoryApi = (streamRunEvents = stream()): SearchArcheologyApi =>
  createMockApi<SearchArcheologyApi>({
    startResearch: createMockFn(stream()),
    streamRunEvents: createMockFn(streamRunEvents)
  });

const withRun = (api: SearchArcheologyApi, runId: string) => ({
  loaders: [async () => ({ mockApis: [[searchArcheologyApiRef, api]] })],
  parameters: { backstage: { routeEntries: [`/?run=${runId}`] } }
});
/** Shows the untouched page and opens the bounded research dialog. */
export const Idle: Story = {
  loaders: [async () => ({ mockApis: [[searchArcheologyApiRef, createStoryApi()]] })],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Start research' })).toBeEnabled();
    await expect(canvas.getByText('No run selected.')).toBeInTheDocument();
    await expect(canvas.getByText(/Start a scoped question or open a saved run/)).toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: 'Start research' }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog).toBeVisible());
    await expect(screen.getByRole('heading', { name: 'Research legacy-system familiarity' })).toBeInTheDocument();
  }
};

/** Replays a scan while ticket retrieval and identity resolution are still running. */
export const Researching: Story = {
  ...withRun(
    createStoryApi(
      stream({ type: 'step', data: { runId: 'run-archeology-researching', seq: 1, node: 'ticket-search', phase: 'enter' } })
    ),
    'run-archeology-researching'
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('enter: ticket-search')).toBeInTheDocument();
    await expect(canvas.getByTestId('progress')).toBeInTheDocument();
  }
};

/** Replays a complete matrix with active and offboarded contributors plus linked citations. */
export const MatrixReady: Story = {
  ...withRun(
    createStoryApi(
      stream(matrixEvent('run-archeology-ready', matrix), { type: 'done', data: { runId: 'run-archeology-ready' } })
    ),
    'run-archeology-ready'
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.findByText('Who has triaged payment-reconciliation incidents?')).resolves.toBeInTheDocument();
    await expect(canvas.getByText(/Status: complete · Confidence: high/)).toBeInTheDocument();
    await expect(canvas.getByRole('region', { name: 'Familiarity candidates' })).toHaveTextContent('Alice Chen');
    await expect(canvas.getByRole('region', { name: 'Offboarded contributors' })).toHaveTextContent('Former Engineer');
    await expect(canvas.getByRole('region', { name: 'Research limitations' })).toHaveTextContent('Commit history');
    await expect(canvas.getByRole('link', { name: 'Alice Chen triaged payment incident PAY-184.' })).toHaveAttribute('href', 'https://tickets.example.test/PAY-184');
  }
};

/** Shows a bounded inconclusive result with no active or offboarded candidates. */
export const Inconclusive: Story = {
  ...withRun(
    createStoryApi(
      stream(matrixEvent('run-archeology-inconclusive', partialMatrix), { type: 'done', data: { runId: 'run-archeology-inconclusive' } })
    ),
    'run-archeology-inconclusive'
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/Status: inconclusive · Confidence: low/)).toBeInTheDocument();
    await expect(canvas.getByText(/No non-offboarded candidates were identified/)).toBeInTheDocument();
    await expect(canvas.getByText('No contributors were marked offboarded.')).toBeInTheDocument();
  }
};

/** Displays a research failure while preserving the start-research control. */
export const ResearchError: Story = {
  ...withRun(
    createStoryApi(
      stream({ type: 'error', data: { runId: 'run-archeology-error', message: 'Ticket provider unavailable for the requested research scope.' } })
    ),
    'run-archeology-error'
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('alert')).toHaveTextContent('Ticket provider unavailable');
    await expect(canvas.getByRole('button', { name: 'Start research' })).toBeEnabled();
  }
};

