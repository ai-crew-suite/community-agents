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
import { ImpactAssessmentPanel } from '../ImpactAssessmentPanel';

describe('ImpactAssessmentPanel', () => {
  it('renders textual evidence, owner routing, and distinct unknown and unaffected outcomes', () => {
    render(
      <ImpactAssessmentPanel
        assessment={{
          entityRef: 'component:default/api',
          change: { kind: 'endpoint_removed', symbol: '/v1/charge' },
          status: 'partial',
          graphTruncated: true,
          counts: { impacted: 1, unaffected: 1, unknown: 1 },
          ownerRollups: [
            {
              owner: 'group:default/payments',
              impactedCount: 1,
              highestSeverity: 'critical',
              consumers: ['component:default/one'],
            },
          ],
          limitations: ['Search was bounded.'],
          consumers: [
            {
              entityRef: 'component:default/one',
              owner: 'group:default/payments',
              hop: 1,
              relationId: 'dep-1',
              repoUrl: 'https://github.com/acme/one',
              classification: 'impacted',
              severity: 'critical',
              matches: [
                {
                  id: 'match-1',
                  repoUrl: 'https://github.com/acme/one',
                  path: 'src/client.ts',
                  line: 42,
                  query: '/v1/charge',
                },
              ],
            },
            {
              entityRef: 'component:default/two',
              owner: 'unowned',
              hop: 1,
              relationId: 'dep-2',
              classification: 'unknown',
              reason: 'no_repository',
              matches: [],
            },
            {
              entityRef: 'component:default/three',
              owner: 'group:default/three',
              hop: 1,
              relationId: 'dep-3',
              repoUrl: 'https://github.com/acme/three',
              classification: 'unaffected',
              matches: [],
            },
          ],
        }}
      />,
    );

    expect(
      screen.getByRole('region', { name: 'Owner rollup' }).textContent,
    ).toContain('group:default/payments');

    expect(
      screen
        .getByRole('link', { name: 'src/client.ts:42' })
        .getAttribute('href'),
    ).toBe('https://github.com/acme/one');

    expect(screen.getByText('unknown: no repository').textContent).toBe(
      'unknown: no repository',
    );

    expect(screen.getByText('unaffected').textContent).toBe('unaffected');
    expect(screen.getByRole('status').textContent).toContain('truncated');
  });
});
