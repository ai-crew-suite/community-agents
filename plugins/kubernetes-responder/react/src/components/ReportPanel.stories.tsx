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
import { ReportPanel } from './ReportPanel';

const meta: Meta<typeof ReportPanel> = {
  title: 'Plugins/KubernetesAIResponder/ReportPanel',
  component: ReportPanel,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: 'Presents the model-inferred causes, recommended next steps, and limitations of an incident investigation.'
      }
    }
  },
  argTypes: {
    report: {
      control: 'object',
      description: 'Completed incident triage report to display.'
    }
  }
};
export default meta;
type Story = StoryObj<typeof ReportPanel>;

const baseReport: IncidentTriageReport = {
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
  recommendedNextSteps: [
    'Review worker concurrency before changing the memory limit.',
    'Deploy the configuration change to a canary environment.'
  ],
  limitations: []
};

/** Displays a complete investigation report with a cited likely cause and next steps. */
export const Investigated: Story = {
  args: {
    report: baseReport
  }
};

/** Displays multiple model-inferred causes with different confidence levels. */
export const MultipleCauses: Story = {
  args: {
    report: {
      ...baseReport,
      likelyCauses: [
        {
          summary: 'Container exceeded its memory limit',
          confidence: 0.92,
          evidence: ['pod:prod/default/payments-api-1']
        },
        {
          summary: 'Recent concurrency increase amplified memory pressure',
          confidence: 0.68,
          evidence: ['commit:8f3d2a1', 'metric:payments-api-memory']
        }
      ],
      limitations: ['The deployment diff could not be correlated with request volume.']
    }
  }
};

/** Explains an investigation outcome where evidence was insufficient to infer a cause. */
export const InsufficientEvidence: Story = {
  args: {
    report: {
      ...baseReport,
      status: 'insufficient_evidence',
      likelyCauses: [],
      recommendedNextSteps: [],
      limitations: ['Fewer than three diagnostic observations were available.']
    }
  }
};

/** Shows the sparse fallback report when no cause or remediation step is supported. */
export const NoSupportedCause: Story = {
  args: {
    report: {
      ...baseReport,
      status: 'failed',
      likelyCauses: [],
      recommendedNextSteps: [],
      limitations: []
    }
  }
};