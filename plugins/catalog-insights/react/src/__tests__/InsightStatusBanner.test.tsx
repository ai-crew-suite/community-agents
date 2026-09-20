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
import { InsightStatusBanner } from '../components/InsightStatusBanner';
import type { CatalogInsightReport } from '../@types';

const answeredReport: CatalogInsightReport = {
  entityRef: 'component:default/payment-gateway',
  question: 'Who is on call?',
  intent: 'ownership-oncall',
  status: 'answered',
  answer: [],
  links: [],
  limitations: [],
  context: [],
};

describe('InsightStatusBanner', () => {
  it('prompts the user to start an insight while idle', () => {
    render(<InsightStatusBanner phase="idle" />);
    expect(screen.getByRole('status')).toHaveTextContent('Ready for a question');
    expect(screen.getByRole('status')).toHaveTextContent(
      'Ask a question to gather cited context for this entity.',
    );
  });

  it('announces progress with a live region while running', () => {
    render(<InsightStatusBanner phase="running" />);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Answering your question',
    );
  });

  it('reports a completed answer', () => {
    render(
      <InsightStatusBanner phase="finished" report={answeredReport} />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Answer ready');
  });

  it('reports a partial answer with a warning', () => {
    render(
      <InsightStatusBanner
        phase="finished"
        report={{ ...answeredReport, status: 'partial' }}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Partial answer');
  });

  it('reports an insufficient-context outcome prominently', () => {
    render(
      <InsightStatusBanner
        phase="finished"
        report={{ ...answeredReport, status: 'insufficient_context' }}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'Insufficient context',
    );
  });

  it('reports a failure with the error message', () => {
    render(<InsightStatusBanner phase="error" error="boom" />);
    const banner = screen.getByRole('status');
    expect(banner).toHaveTextContent('Insight run failed');
    expect(banner).toHaveTextContent('boom');
  });
});
