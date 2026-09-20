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
import { PostmortemDraftPanel } from './PostmortemDraftPanel';
import type { PostmortemDraft } from '../../@types';

const meta: Meta<typeof PostmortemDraftPanel> = {
  title: 'Plugins/TechdocsAiPostmortem/PostmortemDraftPanel',
  component: PostmortemDraftPanel,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Displays a cited, read-only incident timeline draft with source coverage and explicit collection limitations.'
      }
    }
  }
};
export default meta;
type Story = StoryObj<typeof PostmortemDraftPanel>;

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
    },
    {
      id: 'event-alert-peak',
      source: 'alert',
      at: '2026-01-15T09:17:00.000Z',
      summary: 'Payment failure alert reached its highest observed rate.',
    }
  ],
  narrative:
    'The incident was declared after payment failures increased.\nThe alert peak was recorded shortly afterward.',
  coverage: {
    incident: 'collected',
    alerts: 'collected',
    chat: 'unavailable',
    observability: 'unavailable',
    vcs: 'unavailable'
  },
  limitations: [
    'Chat, observability, and version-control sources were unavailable.',
    'This draft does not create or publish a postmortem.'
  ]
};

const incidentUnavailable: PostmortemDraft = {
  ...draft,
  incidentId: 'INC-2026-0000',
  title: 'Unavailable incident record',
  status: 'incident_unavailable',
  window: undefined,
  timeline: [],
  narrative: 'No incident timeline could be assembled.',
  coverage: {
    incident: 'unavailable',
    alerts: 'empty',
    chat: 'unavailable',
    observability: 'unavailable',
    vcs: 'unavailable'
  },
  limitations: ['The incident record was unavailable for this request.']
};

/** Displays a partial draft with cited timeline events, source coverage, and limitations. */
export const DraftWithTimeline: Story = {
  args: { draft },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Payments API elevated error rate')).toBeInTheDocument();
    await expect(canvas.getByText(/Status: partial/)).toBeInTheDocument();
    await expect(canvas.getByText(/Window:/)).toBeInTheDocument();
    await expect(canvas.getByRole('region', { name: 'Timeline of events' })).toHaveTextContent('Incident declared after payment failures');
    await expect(canvas.getByRole('region', { name: 'Source coverage' })).toHaveTextContent('chat: unavailable');
    await expect(canvas.getByRole('region', { name: 'Timeline narrative' })).toHaveTextContent('The alert peak was recorded');
    await expect(canvas.getByRole('region', { name: 'Draft limitations' })).toHaveTextContent('does not create or publish a postmortem');
    await expect(canvas.getByRole('link', { name: 'Source reference' })).toHaveAttribute('href', 'https://status.example.test/incidents/INC-2026-0142');
  }
};

/** Shows an incident-unavailable draft with no timeline and explicit source gaps. */
export const IncidentUnavailable: Story = {
  args: { draft: incidentUnavailable },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Unavailable incident record')).toBeInTheDocument();
    await expect(canvas.getByText(/Status: incident_unavailable/)).toBeInTheDocument();
    await expect(canvas.getByRole('region', { name: 'Timeline of events' })).toBeInTheDocument();
    await expect(canvas.getByRole('region', { name: 'Source coverage' })).toHaveTextContent('incident: unavailable');
    await expect(canvas.getByRole('region', { name: 'Draft limitations' })).toHaveTextContent('incident record was unavailable');
  }
};
