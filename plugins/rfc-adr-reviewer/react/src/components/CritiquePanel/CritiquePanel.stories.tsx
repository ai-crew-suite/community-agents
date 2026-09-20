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
import type { DesignCritique } from '../../@types';
import { CritiquePanel } from './CritiquePanel';

const meta: Meta<typeof CritiquePanel> = {
  title: 'Plugins/RfcAdrAIReviewer/CritiquePanel',
  component: CritiquePanel,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: 'Presents the deterministic critique verdict, cited findings, evidence, and review limitations.'
      }
    }
  },
  argTypes: {
    critique: {
      control: 'object',
      description: 'Merged design critique artifact to render.'
    }
  }
};
export default meta;
type Story = StoryObj<typeof CritiquePanel>;

const blockedCritique: DesignCritique = {
  repoUrl: 'https://github.com/acme/product',
  path: 'adr/0007-event-bus.md',
  verdict: 'block',
  findings: [
    {
      id: 'arch-1',
      channel: 'senior-architect',
      severity: 'medium',
      summary: 'The proposal references a deprecated event-bus component.',
      citations: ['document-1']
    },
    {
      id: 'sec-1',
      channel: 'security-lead',
      severity: 'critical',
      summary: 'No token rotation policy is defined for the new integration.',
      citations: ['policy-1']
    }
  ],
  limitations: ['PR commenting is disabled for this repository.'],
  evidence: [
    {
      id: 'document-1',
      source: 'document',
      summary: 'ADR adr/0007-event-bus.md',
      reference: 'adr/0007-event-bus.md'
    }
  ]
};

const approvedCritique: DesignCritique = {
  ...blockedCritique,
  verdict: 'approve',
  findings: [],
  limitations: [],
  evidence: []
};

const partialCritique: DesignCritique = {
  ...blockedCritique,
  verdict: 'comment',
  findings: [
    {
      id: 'arch-2',
      channel: 'senior-architect',
      severity: 'low',
      summary: 'The migration sequencing needs a clearer rollback plan.',
      citations: ['missing-evidence']
    }
  ],
  limitations: [
    'The compliance catalog was unavailable during this review.',
    'Only the latest document revision was available.'
  ],
  evidence: []
};

/** Shows a blocked critique with severity ordering, citations, and limitations. */
export const BlockingFindings: Story = {
  args: { critique: blockedCritique },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('block')).toBeInTheDocument();
    await expect(canvas.getByText(/Blocking concerns were found/)).toBeInTheDocument();
    await expect(
      canvas.getByText('No token rotation policy is defined for the new integration.')
    ).toBeInTheDocument();
    await expect(canvas.getByText('policy-1 · Evidence not retained.')).toBeInTheDocument();
    await expect(canvas.getByText('PR commenting is disabled for this repository.')).toBeInTheDocument();
  }
};

/** Shows an approving critique when no cited findings were produced. */
export const NoFindings: Story = {
  args: { critique: approvedCritique },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('approve')).toBeInTheDocument();
    await expect(canvas.getByText(/No cited concerns were found/)).toBeInTheDocument();
    await expect(
      canvas.getByText('No cited findings were produced for this document.')
    ).toBeInTheDocument();
  }
};

/** Shows a non-blocking critique with missing evidence and explicit limitations. */
export const PartialReview: Story = {
  args: { critique: partialCritique },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('comment')).toBeInTheDocument();
    await expect(canvas.getByText(/Non-blocking concerns were found/)).toBeInTheDocument();
    await expect(
      canvas.getByText('The migration sequencing needs a clearer rollback plan.')
    ).toBeInTheDocument();
    await expect(canvas.getByText('missing-evidence · Evidence not retained.')).toBeInTheDocument();
    await expect(
      canvas.getByText('The compliance catalog was unavailable during this review.')
    ).toBeInTheDocument();
  }
};