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
import type { AlertTuningProposal } from '../../@types';
import { NoiseEvidencePanel } from './NoiseEvidencePanel';

const meta: Meta<typeof NoiseEvidencePanel> = {
  title: 'Plugins/AgentCrewSuite/NoiseEvidencePanel',
  component: NoiseEvidencePanel,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: 'Presents deterministic alert-noise statistics and retained evidence citations.'
      }
    }
  },
  argTypes: {
    proposal: {
      control: 'object',
      description: 'Reviewable proposal containing the score and evidence backing the verdict.'
    }
  }
};
export default meta;
type Story = StoryObj<typeof NoiseEvidencePanel>;

const scoredProposal: AlertTuningProposal = {
  alertId: 'payments-api-high-error-rate',
  service: 'payments-api',
  status: 'noisy',
  window: {
    from: '2026-02-01T00:00:00Z',
    to: '2026-02-15T00:00:00Z'
  },
  score: {
    samples: 42,
    autoResolveRatio: 0.86,
    medianSelfClearSeconds: 75,
    p90SelfClearSeconds: 210,
    pagedRatio: 0.09,
    verdict: 'noisy',
    suppressedBy: ['maintenance-window', 'known-deployment']
  },
  changes: [],
  confidence: 'high',
  limitations: [],
  evidence: [
    {
      id: 'alert-history-1',
      source: 'alert',
      summary: '36 of 42 firings self-cleared within four minutes.',
      reference: 'incident-history/payments-api'
    },
    {
      id: 'metric-1',
      source: 'metric',
      summary: 'Only 9% of firings resulted in a page.',
      reference: 'metrics/payments-api/error-rate'
    }
  ]
};

const insufficientEvidenceProposal: AlertTuningProposal = {
  ...scoredProposal,
  status: 'insufficient_evidence',
  score: undefined,
  evidence: [
    {
      id: 'evidence-floor-1',
      source: 'alert',
      summary: 'Only two alert firings were available in the requested window.'
    }
  ]
};

/** Displays a scored noisy-alert verdict with suppression context and citations. */
export const ScoredNoise: Story = {
  args: {
    proposal: scoredProposal
  }
};

/** Explains why statistics are unavailable when the evidence floor is not met. */
export const InsufficientEvidence: Story = {
  args: {
    proposal: insufficientEvidenceProposal
  }
};