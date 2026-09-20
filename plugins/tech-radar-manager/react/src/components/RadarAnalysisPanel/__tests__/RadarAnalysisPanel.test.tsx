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
import { RadarAnalysisPanel } from '../RadarAnalysisPanel';

describe('RadarAnalysisPanel', () => {
  it('renders direct-dependency metrics, proposal evidence, and non-submission limitation', () => {
    render(
      <RadarAnalysisPanel
        analysis={{
          radarSource: 'https://example.test/radar.json',
          scannedAt: '2026-01-01T00:00:00.000Z',
          coverage: { scanned: 1, unavailable: 0, failed: 0, total: 1 },
          metrics: [
            {
              technology: 'vite',
              repositoriesUsing: 1,
              repositoriesScanned: 1,
              ratio: 1,
              currentRing: 'assess',
              usingRepos: ['repo-1'],
            },
          ],
          proposals: [
            {
              technology: 'vite',
              fromRing: 'assess',
              toRing: 'trial',
              quadrant: 'tools',
              triggeredBy: ['ratio'],
              metric: {
                technology: 'vite',
                repositoriesUsing: 1,
                repositoriesScanned: 1,
                ratio: 1,
                currentRing: 'assess',
                usingRepos: ['repo-1'],
              },
              rationale: 'Vite is declared.',
            },
          ],
          deprecations: [],
          duplicateCapabilities: [],
          executiveSummary: 'One proposal.',
          status: 'analysis_only',
          limitations: ['Submission is disabled.'],
          evidence: [
            {
              id: 'repo-1',
              source: 'repo',
              summary: 'Scanned repository',
              reference: 'https://github.com/acme/web',
            },
          ],
        }}
      />,
    );

    expect(
      screen.getByRole('region', { name: 'Adoption metrics' }).textContent,
    ).toContain('vite: 1/1 (100%)');

    expect(
      screen.getByRole('region', { name: 'Transition proposals' }).textContent,
    ).toContain('assess → trial');

    expect(
      screen.getByRole('region', { name: 'Analysis limitations' }).textContent,
    ).toContain('Submission is disabled.');

    expect(
      screen
        .getByRole('link', { name: 'Scanned repository' })
        .getAttribute('href'),
    ).toBe('https://github.com/acme/web');
  });
});
