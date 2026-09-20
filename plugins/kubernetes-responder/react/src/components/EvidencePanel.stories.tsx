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
import type { IncidentEvidence } from '../@types';
import { EvidencePanel } from './EvidencePanel';

const meta: Meta<typeof EvidencePanel> = {
  title: 'Plugins/KubernetesAIResponder/EvidencePanel',
  component: EvidencePanel,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: 'Displays the redacted and bounded evidence supporting a Kubernetes incident investigation.'
      }
    }
  },
  argTypes: {
    evidence: {
      control: 'object',
      description: 'Observed evidence items retained for the investigation report.'
    }
  }
};
export default meta;
type Story = StoryObj<typeof EvidencePanel>;

const evidence: IncidentEvidence[] = [
  {
    id: 'ev-kubernetes-1',
    source: 'kubernetes',
    kind: 'pod',
    observedAt: '2026-02-15T10:04:00Z',
    summary: 'The payment-gateway pod was restarted after exceeding its memory limit.',
    reference: 'cluster-a/production/payment-gateway-7c9f6d8b6f-x2k4p',
    confidence: 'high'
  },
  {
    id: 'ev-observability-1',
    source: 'observability',
    kind: 'metric',
    observedAt: '2026-02-15T10:05:00Z',
    summary: 'Memory usage reached 99% shortly before the restart.',
    reference: 'metrics/payment-gateway/memory-working-set',
    confidence: 'high'
  },
  {
    id: 'ev-vcs-1',
    source: 'vcs',
    kind: 'commit',
    observedAt: '2026-02-15T09:45:00Z',
    summary: 'The latest deployment increased the worker concurrency setting.',
    reference: 'commit:8f3d2a1',
    confidence: 'medium'
  },
  {
    id: 'ev-knowledge-1',
    source: 'knowledge',
    kind: 'runbook',
    summary: 'The runbook recommends reducing concurrency before increasing pod memory limits.'
  }
];

/** Displays a mixed evidence bundle with confidence, timestamps, and references. */
export const CollectedEvidence: Story = {
  args: {
    evidence
  }
};

/** Displays evidence with and without optional confidence and reference metadata. */
export const OptionalMetadata: Story = {
  args: {
    evidence: [evidence[0], evidence[3]]
  }
};

/** Explains when an investigation completed without retaining evidence. */
export const Empty: Story = {
  args: {
    evidence: []
  }
};