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
import { JanitorReportPanel } from '../JanitorReportPanel';

describe('JanitorReportPanel', () => {
  it('renders source-ranged ownership drift and limitations', () => {
    render(
      <JanitorReportPanel
        report={{
          entityRef: 'component:default/payments',
          repoUrl: 'https://github.com/acme/payments',
          status: 'findings',
          discrepancies: [
            {
              id: 'disc-1',
              kind: 'ownership_drift',
              severity: 'high',
              message: 'Owner drift.',
              range: {
                path: 'docs/index.md',
                startLine: 2,
                endLine: 2,
                excerpt: 'owner: team-alpha',
              },
              replacement: 'team-beta',
              evidence: ['cat-1'],
            },
          ],
          limitations: ['No patch delivery.'],
          evidence: [
            {
              id: 'cat-1',
              source: 'catalog',
              summary: 'Catalog owner',
              reference: 'component:default/payments',
            },
          ],
        }}
      />,
    );

    expect(
      screen.getByRole('region', { name: 'Documentation discrepancies' })
        .textContent,
    ).toContain('docs/index.md:2-2');

    expect(
      screen.getByRole('region', { name: 'Audit limitations' }).textContent,
    ).toContain('No patch delivery.');

    expect(
      screen.getByRole('link', { name: 'Catalog owner' }).getAttribute('href'),
    ).toBe('component:default/payments');
  });
});
