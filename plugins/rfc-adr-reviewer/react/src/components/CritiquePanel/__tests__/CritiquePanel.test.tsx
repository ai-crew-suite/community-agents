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
import { CritiquePanel } from '../CritiquePanel';
import type { DesignCritique } from '../../../@types';

const critique: DesignCritique = {
  repoUrl: 'https://github.com/acme/product',
  path: 'adr/0007-event-bus.md',
  verdict: 'block',
  findings: [
    {
      id: 'arch-1',
      channel: 'senior-architect',
      severity: 'medium',
      summary: 'References a deprecated component.',
      citations: ['document-1'],
    },
    {
      id: 'sec-1',
      channel: 'security-lead',
      severity: 'critical',
      summary: 'No token rotation policy is defined.',
      citations: ['policy-1'],
    },
  ],
  limitations: ['PR commenting is disabled.'],
  evidence: [
    {
      id: 'document-1',
      source: 'document',
      summary: 'RFC/ADR document adr/0007-event-bus.md',
    },
  ],
};

describe('CritiquePanel', () => {
  it('shows the verdict, both perspectives, and severity ordering', () => {
    render(<CritiquePanel critique={critique} />);

    expect(screen.getByText('block')).toBeInTheDocument();
    expect(
      screen.getByText(/Blocking concerns were found/),
    ).toBeInTheDocument();

    const summaries = screen
      .getAllByText(/deprecated component|token rotation policy/)
      .map(node => node.textContent);
    expect(summaries[0]).toContain('token rotation policy');

    expect(screen.getByText(/Security Lead · sec-1/)).toBeInTheDocument();
    expect(screen.getByText(/Senior Architect · arch-1/)).toBeInTheDocument();
  });

  it('expands citations and flags evidence that was not retained', () => {
    render(<CritiquePanel critique={critique} />);

    expect(
      screen.getByText(/document-1 · RFC\/ADR document/),
    ).toBeInTheDocument();
    expect(
      screen.getByText('policy-1 · Evidence not retained.'),
    ).toBeInTheDocument();
  });

  it('renders limitations and an approving verdict with no findings', () => {
    render(
      <CritiquePanel
        critique={{ ...critique, verdict: 'approve', findings: [] }}
      />,
    );

    expect(
      screen.getByText('No cited findings were produced for this document.'),
    ).toBeInTheDocument();
    expect(screen.getByText('PR commenting is disabled.')).toBeInTheDocument();
  });
});
