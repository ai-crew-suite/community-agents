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
import { IntentProposalPanel } from '../IntentProposalPanel';

describe('IntentProposalPanel', () => {
  it('renders candidate, schema parameter, blocking collision, and proposal-only limitation', () => {
    render(
      <IntentProposalPanel
        proposal={{
          utterance: 'Create a react app called payment-gateway',
          sessionId: 'run-1',
          status: 'awaiting_correction',
          selectedTemplate: 'template:default/react-service-template',
          candidates: [
            {
              templateRef: 'template:default/react-service-template',
              score: 1,
              matchedOn: ['react'],
              evidence: ['tpl-1'],
            },
          ],
          confidence: 'low',
          parameters: [
            {
              field: 'name',
              value: 'payment-gateway',
              origin: 'utterance',
              evidence: ['tpl-1'],
            },
          ],
          issues: [
            {
              id: 'iss-1',
              field: 'name',
              kind: 'name_taken',
              message: 'Component name is taken.',
              blocking: true,
              question: 'What name should I use?',
              evidence: ['cat-1'],
            },
          ],
          turns: 0,
          limitations: ['Correction turns are unavailable.'],
          evidence: [],
        }}
      />,
    );

    expect(
      screen.getByRole('region', { name: 'Template candidates' }).textContent,
    ).toContain('react-service-template');

    expect(
      screen.getByRole('region', { name: 'Resolved parameters' }).textContent,
    ).toContain('payment-gateway');

    expect(screen.getByText('blocking').textContent).toBe('blocking');

    expect(
      screen.getByText('Requested correction: What name should I use?')
        .textContent,
    ).toContain('What name');

    expect(screen.getByRole('status').textContent).toContain(
      'does not yet accept correction turns',
    );

    expect(
      screen.getByRole('region', { name: 'Proposal limitations' }).textContent,
    ).toContain('does not create a Scaffolder task');
  });
});
