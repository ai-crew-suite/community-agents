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
import { DebtReportPanel } from '../DebtReportPanel';

describe('DebtReportPanel', () => {
  it('renders retained suppressed findings and unsupported scan limitations', () => {
    render(
      <DebtReportPanel
        report={{
          scannedAt: '2026-01-01T00:00:00.000Z',
          targets: [
            {
              repoUrl: 'https://bitbucket.org/acme/payments',
              status: 'search_unsupported',
              signalCount: 0,
              reason: 'Search unsupported.',
            },
          ],
          findings: [
            {
              signal: {
                id: 'sig-1',
                kind: 'marker',
                repoUrl: 'https://bitbucket.org/acme/payments',
                path: 'src/a.ts',
                raw: '// TODO: clean up',
                markerTag: 'TODO',
                evidence: ['sig-1'],
              },
              fingerprint: 'abc',
              severity: 'low',
              score: 1,
              reasons: ['marker_todo'],
              disposition: 'suppressed',
              summary: 'Suppressed finding.',
              corroboration: [],
            },
          ],
          counts: { escalate: 0, suppressed: 1, alreadyTracked: 0 },
          bySeverity: { critical: 0, high: 0, medium: 0, low: 1 },
          byOwner: [],
          status: 'partial',
          limitations: [
            'Repository search is unsupported; zero findings is not clean.',
          ],
          evidence: [
            {
              id: 'sig-1',
              source: 'code',
              summary: 'Candidate',
              reference: 'https://bitbucket.org/acme/payments',
            },
          ],
        }}
      />,
    );

    expect(
      screen.getByRole('region', { name: 'Suppressed findings' }).textContent,
    ).toContain('src/a.ts');

    expect(
      screen.getByRole('region', { name: 'Repository outcomes' }).textContent,
    ).toContain('search_unsupported');

    expect(
      screen.getByRole('region', { name: 'Report limitations' }).textContent,
    ).toContain('zero findings is not clean');

    expect(
      screen.getByRole('link', { name: 'Candidate' }).getAttribute('href'),
    ).toBe('https://bitbucket.org/acme/payments');
  });
});
