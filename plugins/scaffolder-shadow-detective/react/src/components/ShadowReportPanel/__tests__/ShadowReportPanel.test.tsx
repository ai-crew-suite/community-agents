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
import { ShadowReportPanel } from '../ShadowReportPanel';

describe('ShadowReportPanel', () => {
  it('renders verified ownership, claim link, unknown outcome, and report-only limitation', () => {
    render(
      <ShadowReportPanel
        report={{
          providers: ['aws'],
          scanned: 2,
          registered: 1,
          suppressedCount: 0,
          status: 'report_only',
          limitations: ['Outreach is unavailable.'],
          evidence: [],
          orphans: [
            {
              fingerprint: 'aws:rds:db-shadow-99',
              confidence: 'high',
              claimUrl: 'https://portal.example.test/create',
              rationale: 'Owner tag resolves.',
              asset: {
                id: 'db-shadow-99',
                provider: 'aws',
                type: 'rds',
                evidence: ['asset-1'],
              },
              hypotheses: [
                {
                  id: 'own-1',
                  groupRef: 'group:default/team-checkout',
                  basis: 'owner_tag',
                  score: 1,
                  evidence: ['tag-1'],
                },
              ],
            },
            {
              fingerprint: 'aws:s3:unknown',
              confidence: 'unknown',
              claimUrl: 'https://portal.example.test/create-unknown',
              rationale: 'No evidence.',
              asset: {
                id: 'unknown',
                provider: 'aws',
                type: 's3',
                evidence: ['asset-2'],
              },
              hypotheses: [],
            },
          ],
        }}
      />,
    );

    expect(
      screen
        .getAllByRole('link', { name: 'Claim this resource' })[0]
        .getAttribute('href'),
    ).toBe('https://portal.example.test/create');

    expect(
      screen.getByText(/group:default\/team-checkout/).textContent,
    ).toContain('owner_tag');

    expect(screen.getByText(/Owner: unknown/).textContent).toContain('unknown');

    expect(
      screen.getByRole('region', { name: 'Report limitations' }).textContent,
    ).toContain('does not send outreach');
  });
});
