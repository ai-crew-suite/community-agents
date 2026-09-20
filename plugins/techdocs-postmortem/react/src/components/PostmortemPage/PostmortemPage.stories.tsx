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
import { techdocsPostmortemApiRef, type TechdocsPostmortemApi } from '../../api';
import { POSTMORTEM_DRAFT_ARTIFACT } from '../../hooks/usePostmortemRun';
import type { AiRunEvent, PostmortemDraft } from '../../@types';
import { PostmortemPage } from './PostmortemPage';

const meta: Meta<typeof PostmortemPage> = {
  title: 'Plugins/TechdocsAiPostmortem/PostmortemPage',
  component: PostmortemPage,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Standalone page for starting and replaying read-only incident timeline drafts with cited source coverage.'
      }
    }
  }
};
export default meta;
type Story = StoryObj<typeof PostmortemPage>;

const draft: PostmortemDraft = {
  incidentId: 'INC-2026-0142',
  title: 'Payments API elevated error rate',
  status: 'partial',
  window: {
    since: '2026-01-15T09:00:00.000Z',
    until: '2026-01-15T10:30:00.000Z'
  },
  timeline: [
    {
      id: 'event-incident-opened',
      source: 'incident',
      at: '2026-01-15T09:05:00.000Z',
      summary: 'Incident declared after payment failures exceeded the response threshold.',
      reference: 'https://status.example.test/incidents/INC-2026-0142'
    }
  ],
  narrative: 'The incident was declared after payment failures increased.',
  coverage: {
    incident: 'collected',
    alerts: 'collected',
    chat: 'unavailable',
    observability: 'unavailable',
    vcs: 'unavailable'
  },
  limitations: ['Chat, observability, and version-control sources were unavailable.']
};

const stream = (...events: AiRunEvent[]) => {
  async function* streamEvents(): AsyncGenerator<AiRunEvent> {
    yield* events;
  }
  return streamEvents;
};

const draftEvent = (runId: string): AiRunEvent => ({
  type: 'artifact',
  data: { runId, kind: POSTMORTEM_DRAFT_ARTIFACT, ref: JSON.stringify(draft) }
});

const createStoryApi = (
  startDraft = stream(),
  streamRunEvents = stream(),
): TechdocsPostmortemApi =>
  createMockApi<TechdocsPostmortemApi>({
    startDraft: createMockFn(startDraft),
    streamRunEvents: createMockFn(streamRunEvents)
  });

const withApi = (api: TechdocsPostmortemApi) => async () => ({
  mockApis: [[techdocsPostmortemApiRef, api]]
});

const withRun = (api: TechdocsPostmortemApi, runId: string) => ({
  loaders: [withApi(api)],
  parameters: { backstage: { routeEntries: [`/?run=${runId}`] } }
});

/** Shows the untouched page and opens the incident timeline draft dialog. */
export const Idle: Story = {
  loaders: [withApi(createStoryApi())],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Draft timeline' })).toBeEnabled();
    await expect(canvas.getByText('No draft selected.')).toBeInTheDocument();
    await expect(canvas.getByText(/Start a resolved incident draft/)).toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: 'Draft timeline' }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog).toBeVisible());
    await expect(within(dialog).getByRole('heading', { name: 'Draft incident timeline' })).toBeInTheDocument();
  }
};

/** Replays an in-progress postmortem draft while source collection is running. */
export const Drafting: Story = {
  ...withRun(
    createStoryApi(
      stream(),
      stream({ type: 'step', data: { runId: 'run-postmortem-drafting', seq: 1, node: 'gather-alerts', phase: 'enter' } })
    ),
    'run-postmortem-drafting'
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('enter: gather-alerts')).toBeInTheDocument();
    await expect(canvas.getByTestId('progress')).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Draft timeline' })).toBeInTheDocument();
  }
};

/** Replays a completed postmortem draft with timeline, coverage, and source evidence. */
export const DraftReady: Story = {
  ...withRun(
    createStoryApi(
      stream(),
      stream(
        { type: 'step', data: { runId: 'run-postmortem-ready', seq: 1, node: 'narrate', phase: 'exit' } },
        draftEvent('run-postmortem-ready'),
        { type: 'done', data: { runId: 'run-postmortem-ready' } }
      )
    ),
    'run-postmortem-ready'
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.findByText('Payments API elevated error rate')).resolves.toBeInTheDocument();
    await expect(canvas.getByText('exit: narrate')).toBeInTheDocument();
    await expect(canvas.getByText(/Status: partial/)).toBeInTheDocument();
    await expect(canvas.getByRole('region', { name: 'Timeline of events' })).toHaveTextContent('Incident declared after payment failures');
    await expect(canvas.getByRole('region', { name: 'Source coverage' })).toHaveTextContent('chat: unavailable');
    await expect(canvas.getByRole('region', { name: 'Draft limitations' })).toHaveTextContent('sources were unavailable');
    await expect(canvas.getByRole('link', { name: 'Source reference' })).toHaveAttribute('href', 'https://status.example.test/incidents/INC-2026-0142');
  }
};

/** Displays a postmortem drafting failure while keeping the timeline action available. */
export const DraftError: Story = {
  ...withRun(
    createStoryApi(
      stream(),
      stream({ type: 'error', data: { runId: 'run-postmortem-error', message: 'Postmortem drafting failed: incident service unavailable.' } })
    ),
    'run-postmortem-error'
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('alert')).toHaveTextContent('incident service unavailable');
    await expect(canvas.getByRole('button', { name: 'Draft timeline' })).toBeEnabled();
    await expect(canvas.getByText(/Start a resolved incident draft/)).toBeInTheDocument();
  }
};

