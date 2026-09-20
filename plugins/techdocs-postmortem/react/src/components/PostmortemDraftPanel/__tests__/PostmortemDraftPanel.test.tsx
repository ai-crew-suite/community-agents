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
import { PostmortemDraftPanel } from '../PostmortemDraftPanel';

describe('PostmortemDraftPanel', () => {
  it('renders cited timeline events, source coverage, and limitations', () => {
    render(
      <PostmortemDraftPanel
        draft={{
          incidentId: 'INC-1',
          title: 'Payments outage',
          status: 'partial',
          timeline: [
            {
              id: 'ev-1',
              source: 'incident',
              at: '2026-01-01T00:00:00.000Z',
              summary: 'Incident triggered',
              reference: 'https://example.test/INC-1',
            },
          ],
          narrative: 'Incident triggered [ev-1]',
          coverage: {
            incident: 'collected',
            alerts: 'unavailable',
            chat: 'unavailable',
            observability: 'unavailable',
            vcs: 'unavailable',
          },
          limitations: ['Chat unavailable.'],
        }}
      />,
    );

    expect(
      screen.getByRole('region', { name: 'Timeline of events' }).textContent,
    ).toContain('Incident triggered [ev-1]');

    expect(
      screen.getByRole('region', { name: 'Source coverage' }).textContent,
    ).toContain('alerts: unavailable');

    expect(
      screen.getByRole('region', { name: 'Draft limitations' }).textContent,
    ).toContain('Chat unavailable.');

    expect(
      screen
        .getByRole('link', { name: 'Source reference' })
        .getAttribute('href'),
    ).toBe('https://example.test/INC-1');
  });
});
