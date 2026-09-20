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
import { BlueprintPanel } from '../BlueprintPanel';

describe('BlueprintPanel', () => {
  it('renders cited three-channel blueprint and blueprint-only limitation', () => {
    render(
      <BlueprintPanel
        blueprint={{
          title: 'Multi factor authentication',
          blueprintHash: 'hash',
          readiness: 'complete',
          status: 'blueprint_only',
          epic: {
            title: 'MFA',
            description: 'Secure access',
            evidence: ['prd-1'],
          },
          stories: [
            {
              id: 'story-1',
              title: 'Enroll authenticator',
              description: 'Enrollment',
              evidence: ['prd-2'],
            },
          ],
          template: {
            templateRef: 'template:default/react-service-template',
            score: 1,
            parameters: [],
            issues: [],
            evidence: ['prd-1'],
          },
          documentation: {
            files: [
              {
                path: 'docs/architecture.md',
                sections: ['Overview'],
                evidence: ['prd-1'],
              },
            ],
            evidence: ['prd-1'],
          },
          openQuestions: [],
          limitations: ['Writes are disabled.'],
          evidence: [],
        }}
      />,
    );

    expect(
      screen.getByRole('region', { name: 'Product manager channel' })
        .textContent,
    ).toContain('Enroll authenticator');

    expect(
      screen.getByRole('region', { name: 'Engineer channel' }).textContent,
    ).toContain('react-service-template');

    expect(
      screen.getByRole('region', { name: 'Technical writer channel' })
        .textContent,
    ).toContain('docs/architecture.md');

    expect(
      screen.getByRole('region', { name: 'Blueprint limitations' }).textContent,
    ).toContain('does not approve or execute');
  });
});
