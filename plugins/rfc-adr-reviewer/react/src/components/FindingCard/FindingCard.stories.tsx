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
import { expect, within } from 'storybook/test';
import type { ReviewEvidence, ReviewFinding } from '../../@types';
import { FindingCard } from './FindingCard';

type FindingCardProps = React.ComponentProps<typeof FindingCard>;

const meta: Meta<typeof FindingCard> = {
  title: 'Plugins/RfcAdrAIReviewer/FindingCard',
  component: FindingCard,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: 'Displays one cited review finding with its severity, originating perspective, and supporting evidence.'
      }
    }
  },
  argTypes: {
    finding: {
      control: 'object',
      description: 'Cited finding to render.'
    },
    evidence: {
      control: 'object',
      description: 'Retained evidence used to expand the finding citations.'
    }
  }
};
export default meta;
type Story = StoryObj<typeof FindingCard>;

const retainedEvidence: ReviewEvidence[] = [
  {
    id: 'policy-1',
    source: 'compliance',
    summary: 'Security policy requires token rotation every 90 days.',
    reference: 'policy/security/token-rotation'
  }
];

const securityFinding: ReviewFinding = {
  id: 'sec-1',
  channel: 'security-lead',
  severity: 'critical',
  summary: 'The design does not define token rotation responsibilities.',
  citations: ['policy-1']
};

const architecturalFinding: ReviewFinding = {
  id: 'arch-1',
  channel: 'senior-architect',
  severity: 'high',
  summary: 'The migration path does not define a rollback strategy.',
  citations: ['document-2']
};

const multiCitationFinding: ReviewFinding = {
  id: 'arch-2',
  channel: 'senior-architect',
  severity: 'low',
  summary: 'The proposal could clarify ownership boundaries between services.',
  citations: ['document-1', 'document-2']
};

const baseProps: FindingCardProps = {
  finding: securityFinding,
  evidence: retainedEvidence
};

/** Shows a critical security finding with retained, expanded evidence. */
export const CriticalSecurityFinding: Story = {
  args: baseProps,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('critical')).toBeInTheDocument();
    await expect(canvas.getByText(/Security Lead · sec-1/)).toBeInTheDocument();
    await expect(
      canvas.getByText('The design does not define token rotation responsibilities.')
    ).toBeInTheDocument();
    await expect(canvas.getByText('Cites: policy-1')).toBeInTheDocument();
    await expect(
      canvas.getByText('policy-1 · Security policy requires token rotation every 90 days.')
    ).toBeInTheDocument();
  }
};

/** Shows a high architectural finding whose citation evidence was not retained. */
export const MissingEvidence: Story = {
  args: {
    finding: architecturalFinding,
    evidence: []
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('high')).toBeInTheDocument();
    await expect(canvas.getByText(/Senior Architect · arch-1/)).toBeInTheDocument();
    await expect(canvas.getByText('document-2 · Evidence not retained.')).toBeInTheDocument();
  }
};

/** Shows a low-severity finding supported by multiple citations. */
export const MultipleCitations: Story = {
  args: {
    finding: multiCitationFinding,
    evidence: [
      { id: 'document-1', source: 'document', summary: 'Service ownership section.' },
      { id: 'document-2', source: 'document', summary: 'Dependency boundaries section.' }
    ]
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('low')).toBeInTheDocument();
    await expect(canvas.getByText('Cites: document-1, document-2')).toBeInTheDocument();
    await expect(canvas.getByText('document-1 · Service ownership section.')).toBeInTheDocument();
    await expect(canvas.getByText('document-2 · Dependency boundaries section.')).toBeInTheDocument();
  }
};