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
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ExpertiseMatrixPanel } from '../ExpertiseMatrixPanel';

describe('ExpertiseMatrixPanel', () => {
  it('shows citations, limitations, and an explicit offboarded identity', () => {
    render(
      <ExpertiseMatrixPanel
        matrix={{
          question: 'Who knows payments?',
          scope: {
            question: 'Who knows payments?',
            paths: [],
            era: {
              since: '2024-01-01T00:00:00.000Z',
              until: '2025-01-01T00:00:00.000Z',
            },
          },
          status: 'partial',
          experts: [],
          offboardedContributors: [
            {
              identity: {
                actor: { id: 'retired-dev', displayName: 'Retired Dev' },
                status: 'offboarded',
                groupRefs: [],
                evidence: [],
              },
              score: 1,
              signals: { authored: 0, reviewed: 0, triaged: 1 },
              rationale: 'Ranked from ticket triage evidence only.',
              evidence: ['ticket-1'],
            },
          ],
          narrative: 'Ticket evidence only.',
          confidence: 'low',
          limitations: ['Commit history unavailable.'],
          evidence: [
            {
              id: 'ticket-1',
              source: 'ticket',
              summary: 'triaged OPS-1',
              reference: 'https://example.test/OPS-1',
            },
          ],
        }}
      />,
    );
    expect(
      screen.getByRole('region', { name: 'Offboarded contributors' })
        .textContent,
    ).toContain('Retired Dev');
    expect(
      screen.getByRole('region', { name: 'Research limitations' }).textContent,
    ).toContain('Commit history unavailable.');
    expect(
      screen.getByRole('link', { name: 'triaged OPS-1' }).getAttribute('href'),
    ).toBe('https://example.test/OPS-1');
  });
});
