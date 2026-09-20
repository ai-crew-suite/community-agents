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
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ResolutionBanner } from '../ResolutionBanner';

const resolution = {
  templateRef: 'template:default/database',
  fingerprint: 'assessment-7f3a',
  outcome: 'accepted_mutation' as const,
  approvedParameters: { instanceType: 'db.m5.large' },
  acceptedMutations: ['mutation-instance-type'],
  assessmentRef: 'artifact://guardrail-assessment/assessment-7f3a',
  decidedBy: 'user:default/alice',
  parameterHash: 'params-82c1'
};

describe('ResolutionBanner', () => {
  it('renders a pending message when no resolution exists', () => {
    render(<ResolutionBanner />);

    expect(screen.getByRole('status')).toHaveTextContent(
      'No guardrail resolution is available yet.'
    );
  });

  it('renders the resolution outcome and approved parameters', () => {
    render(<ResolutionBanner resolution={resolution} />);

    expect(screen.getByRole('status')).toHaveTextContent(
      'Negotiation outcome: accepted_mutation'
    );
    expect(screen.getByRole('status')).toHaveTextContent('"instanceType": "db.m5.large"');
  });
});
