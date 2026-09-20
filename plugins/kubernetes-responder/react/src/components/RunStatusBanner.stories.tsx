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
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { IncidentTriageReport } from '../@types';
import type { IncidentRunPhase } from '../hooks/useIncidentRun';
import { RunStatusBanner } from './RunStatusBanner';

type RunStatusBannerProps = React.ComponentProps<typeof RunStatusBanner>;

const meta: Meta<typeof RunStatusBanner> = {
  title: 'Plugins/KubernetesAIResponder/RunStatusBanner',
  component: RunStatusBanner,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: 'Communicates the current lifecycle and evidence outcome of a Kubernetes investigation.'
      }
    }
  },
  argTypes: {
    phase: {
      control: 'select',
      options: ['idle', 'running', 'finished', 'error'] satisfies IncidentRunPhase[],
      description: 'Current lifecycle phase of the investigation.'
    },
    report: {
      control: 'object',
      description: 'Completed triage report whose status determines the final banner.'
    },
    error: {
      control: 'text',
      description: 'Failure detail displayed when the investigation fails.'
    }
  }
};
export default meta;
type Story = StoryObj<typeof RunStatusBanner>;

const investigatedReport: IncidentTriageReport = {
  incidentId: 'incident-payments-1',
  entityRef: 'component:default/payments-api',
  status: 'investigated',
  failureClass: 'oom-killed',
  trigger: {
    version: 1,
    source: 'manual',
    occurredAt: '2026-02-15T10:00:00Z',
    entityRef: 'component:default/payments-api',
    summary: 'Payments API pods restarted after memory pressure.'
  },
  likelyCauses: [
    {
      summary: 'Container exceeded its memory limit',
      confidence: 0.92,
      evidence: ['pod:prod/default/payments-api-1']
    }
  ],
  timeline: [],
  recommendedNextSteps: ['Review worker concurrency before changing the memory limit.'],
  limitations: []
};

const sharedProps: Omit<RunStatusBannerProps, 'phase'> = {
  report: investigatedReport,
  error: undefined
};

/** Shows the intentionally quiet state before an investigation starts. */
export const Idle: Story = {
  args: {
    phase: 'idle',
    ...sharedProps
  }
};

/** Announces that the investigation is actively collecting evidence. */
export const Running: Story = {
  args: {
    phase: 'running',
    report: undefined,
    error: undefined
  }
};

/** Shows the fallback outcome when a run ends without a report artifact. */
export const FinishedWithoutReport: Story = {
  args: {
    phase: 'finished',
    report: undefined,
    error: undefined
  }
};

/** Confirms that the investigation produced a complete report. */
export const InvestigationComplete: Story = {
  args: {
    phase: 'finished',
    ...sharedProps
  }
};

/** Warns when collected evidence cannot support a likely cause. */
export const InsufficientEvidence: Story = {
  args: {
    phase: 'finished',
    report: { ...investigatedReport, status: 'insufficient_evidence' },
    error: undefined
  }
};

/** Shows an investigation failure with an actionable error detail. */
export const Failed: Story = {
  args: {
    phase: 'error',
    report: undefined,
    error: 'Kubernetes API unavailable while collecting pod diagnostics.'
  }
};