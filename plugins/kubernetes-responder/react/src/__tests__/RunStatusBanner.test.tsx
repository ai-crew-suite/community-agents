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
import { RunStatusBanner } from '../components/RunStatusBanner';
import type { IncidentTriageReport } from '../@types';

const investigatedReport: IncidentTriageReport = {
  incidentId: 'incident-1',
  status: 'investigated',
  failureClass: 'oom-killed',
  trigger: {
    version: 1,
    source: 'manual',
    occurredAt: '2026-01-01T00:00:00.000Z',
    summary: 'OOMKilled',
  },
  likelyCauses: [],
  timeline: [],
  recommendedNextSteps: [],
  limitations: [],
};

describe('RunStatusBanner', () => {
  it('prompts the user to start an investigation while idle', () => {
    render(<RunStatusBanner phase="idle" />);
    expect(screen.getByRole('status')).toHaveTextContent('Ready to investigate');
    expect(screen.getByRole('status')).toHaveTextContent(
      'Start an investigation to collect bounded Kubernetes evidence.',
    );
  });

  it('announces progress with a live region while running', () => {
    render(<RunStatusBanner phase="running" />);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Investigation in progress',
    );
  });

  it('reports a completed investigation', () => {
    render(<RunStatusBanner phase="finished" report={investigatedReport} />);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Investigation complete',
    );
  });

  it('reports an insufficient-evidence outcome', () => {
    render(
      <RunStatusBanner
        phase="finished"
        report={{ ...investigatedReport, status: 'insufficient_evidence' }}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'Insufficient evidence',
    );
  });

  it('reports a failure with the error message', () => {
    render(<RunStatusBanner phase="error" error="boom" />);
    const banner = screen.getByRole('status');
    expect(banner).toHaveTextContent('Investigation failed');
    expect(banner).toHaveTextContent('boom');
  });
});
