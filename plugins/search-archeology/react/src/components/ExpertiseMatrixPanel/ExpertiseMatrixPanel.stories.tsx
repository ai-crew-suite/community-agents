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
import { ExpertiseMatrixPanel } from './ExpertiseMatrixPanel';
import type { ExpertiseMatrix } from '../../@types';

const meta: Meta<typeof ExpertiseMatrixPanel> = {
  title: 'Plugins/SearchAiArcheology/ExpertiseMatrixPanel',
  component: ExpertiseMatrixPanel,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Presents ticket-triage familiarity evidence with explicit identity status, retained citations, and limitations that prevent the result from being treated as a performance assessment.'
      }
    }
  }
};
export default meta;
type Story = StoryObj<typeof ExpertiseMatrixPanel>;

const completeMatrix: ExpertiseMatrix = {
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
    {
      id: 'ticket-2',
      source: 'ticket',
      summary: 'Alice Chen triaged payment incident PAY-177.'
    }
  ]
};

const emptyMatrix: ExpertiseMatrix = {
  ...completeMatrix,
  question: 'Who knows the legacy settlement worker?',
  scope: { ...completeMatrix.scope, question: 'Who knows the legacy settlement worker?', paths: [] },
  status: 'inconclusive',
  experts: [],
  offboardedContributors: [],
  confidence: 'low',
  narrative: 'The available ticket evidence was insufficient to identify an active contributor.',
  limitations: ['No catalog entity or repository scope was available for this request.'],
  evidence: []
};

/** Displays active and offboarded familiarity records with linked and plain evidence citations. */
export const CandidatesPresent: Story = {
  args: { matrix: completeMatrix },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Who has triaged payment-reconciliation incidents?')).toBeInTheDocument();
    await expect(canvas.getByText(/Status: complete · Confidence: high/)).toBeInTheDocument();
    await expect(canvas.getByRole('region', { name: 'Familiarity candidates' })).toHaveTextContent('Alice Chen');
    await expect(canvas.getByRole('region', { name: 'Offboarded contributors' })).toHaveTextContent('Former Engineer');
    await expect(canvas.getByRole('link', { name: 'Alice Chen triaged payment incident PAY-184.' })).toHaveAttribute('href', 'https://tickets.example.test/PAY-184');
    await expect(canvas.getByRole('region', { name: 'Evidence citations' })).toHaveTextContent('Alice Chen triaged payment incident PAY-177.');
    await expect(canvas.getByRole('region', { name: 'Research limitations' })).toHaveTextContent('Commit history');
  }
};

/** Shows an inconclusive matrix with no active or offboarded contributors identified. */
export const NoCandidates: Story = {
  args: { matrix: emptyMatrix },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/Status: inconclusive · Confidence: low/)).toBeInTheDocument();
    await expect(canvas.getByText(/No non-offboarded candidates were identified/)).toBeInTheDocument();
    await expect(canvas.getByText('No contributors were marked offboarded.')).toBeInTheDocument();
    await expect(canvas.getByRole('region', { name: 'Evidence citations' })).toBeInTheDocument();
  }
};
