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
import { DebateView } from '../DebateView';
import { initialReviewRunState } from '../../../hooks/useReviewRun';

describe('DebateView', () => {
  it('renders both perspectives as separate live columns', () => {
    render(
      <DebateView
        state={{
          ...initialReviewRunState,
          phase: 'running',
          channels: {
            'senior-architect': {
              status: 'running',
              transcript: 'Deprecated component referenced.',
            },
            'security-lead': { status: 'done', transcript: 'No token rotation.' },
          },
        }}
      />,
    );

    const architect = screen.getByRole('region', {
      name: 'Senior Architect review',
    });
    const security = screen.getByRole('region', {
      name: 'Security Lead review',
    });

    expect(architect).toHaveTextContent('Deprecated component referenced.');
    expect(architect).toHaveTextContent('Reviewing…');
    expect(security).toHaveTextContent('No token rotation.');
    expect(security).toHaveTextContent('Review complete');
  });

  it('states clearly when a perspective has not produced turns yet', () => {
    render(<DebateView state={initialReviewRunState} />);

    expect(
      screen.getAllByText('No turns from this perspective yet.'),
    ).toHaveLength(2);
  });

  it('collapses to one transcript when the stream is not node-tagged', () => {
    render(
      <DebateView
        state={{
          ...initialReviewRunState,
          untaggedTranscript: 'Combined review turns.',
        }}
      />,
    );

    expect(screen.getByText('Review transcript')).toBeInTheDocument();
    expect(screen.getByText('Combined review turns.')).toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'Senior Architect review' }),
    ).not.toBeInTheDocument();
  });
});
