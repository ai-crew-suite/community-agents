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
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { RunTimeline } from '../components/RunTimeline';
import { EvidencePanel } from '../components/EvidencePanel';
import { ReportPanel } from '../components/ReportPanel';
import { IncidentActionButton } from '../components/IncidentActionButton';
import type { IncidentEvidence, IncidentTriageReport } from '../@types';

const evidence: IncidentEvidence[] = [
  {
    id: 'workload:prod/default/payments-api',
    source: 'kubernetes',
    kind: 'workload',
    summary: 'Deployment payments-api: 0/3 replicas ready',
    reference: 'prod/default/Deployment/payments-api',
    confidence: 'high',
  },
  {
    id: 'pod:prod/default/payments-api-1',
    source: 'kubernetes',
    kind: 'pod',
    summary: 'Container payments-api(OOMKilled, restarts=6)',
    observedAt: '2026-01-01T00:05:00.000Z',
    confidence: 'high',
  },
];

const report: IncidentTriageReport = {
  incidentId: 'incident-1',
  entityRef: 'component:default/payments-api',
  status: 'investigated',
  failureClass: 'oom-killed',
  trigger: {
    version: 1,
    source: 'manual',
    occurredAt: '2026-01-01T00:00:00.000Z',
    entityRef: 'component:default/payments-api',
    summary: 'OOMKilled',
  },
  likelyCauses: [
    {
      summary: 'Container exceeded its memory limit',
      confidence: 0.9,
      evidence: ['pod:prod/default/payments-api-1'],
    },
  ],
  timeline: evidence,
  recommendedNextSteps: ['Raise the memory limit for payments-api'],
  limitations: ['Model synthesis unavailable: timeout'],
};

describe('RunTimeline', () => {
  it('explains when no investigation activity exists yet', () => {
    render(<RunTimeline steps={[]} toolEvents={[]} />);
    expect(screen.getByText('No investigation activity yet.')).toBeInTheDocument();
  });

  it('lists workflow nodes with their latest phase and tool activity', () => {
    render(
      <RunTimeline
        steps={[
          { node: 'trigger.validate', phase: 'enter', seq: 1 },
          { node: 'trigger.validate', phase: 'exit', seq: 2 },
          { node: 'workload.resolve', phase: 'enter', seq: 3 },
        ]}
        toolEvents={[
          { kind: 'call', tool: 'kubernetes.workload.resolve' },
          {
            kind: 'result',
            tool: 'kubernetes.workload.resolve',
            ok: true,
            summary: 'resolved',
          },
        ]}
      />,
    );

    expect(screen.getByText('trigger.validate').closest('li')).toHaveAttribute(
      'data-status',
      'done',
    );
    expect(screen.getByText('workload.resolve').closest('li')).toHaveAttribute(
      'data-status',
      'active',
    );
    expect(
      screen.getByText(/kubernetes\.workload\.resolve succeeded/),
    ).toBeInTheDocument();
  });
});

describe('EvidencePanel', () => {
  it('labels evidence as observed data and renders bounded summaries', () => {
    render(<EvidencePanel evidence={evidence} />);
    expect(screen.getByText(/Observed data/)).toBeInTheDocument();
    expect(
      screen.getByText('Deployment payments-api: 0/3 replicas ready'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Reference: prod\/default\/Deployment\/payments-api/),
    ).toBeInTheDocument();
  });

  it('renders an empty state when no evidence was collected', () => {
    render(<EvidencePanel evidence={[]} />);
    expect(screen.getByText(/No evidence was collected/)).toBeInTheDocument();
  });
});

describe('ReportPanel', () => {
  it('labels likely causes as model inference with evidence citations', () => {
    render(<ReportPanel report={report} />);
    expect(screen.getByText(/Model inference/)).toBeInTheDocument();
    expect(
      screen.getByText(/Container exceeded its memory limit/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/cites pod:prod\/default\/payments-api-1/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Failure signature: oom-killed/),
    ).toBeInTheDocument();
  });

  it('renders next steps and limitations', () => {
    render(<ReportPanel report={report} />);
    expect(
      screen.getByText('Raise the memory limit for payments-api'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Model synthesis unavailable: timeout'),
    ).toBeInTheDocument();
  });
});

describe('IncidentActionButton', () => {
  it('deep-links to the triage page with the entity reference prefilled', () => {
    render(
      <MemoryRouter>
        <IncidentActionButton entityRef="component:default/payments-api" />
      </MemoryRouter>,
    );
    const link = screen.getByRole('button', { name: 'Investigate with AI' });
    expect(link).toHaveAttribute(
      'href',
      '/kubernetes-ai-responder?entityRef=component%3Adefault%2Fpayments-api',
    );
  });
});
