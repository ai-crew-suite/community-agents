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
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { ResolutionBanner } from './ResolutionBanner';
import type { ResolutionBannerProps } from './ResolutionBanner';
import type { GuardrailResolution } from '../../@types';

const meta: Meta<typeof ResolutionBanner> = {
  title: 'Plugins/ScaffolderAiGuardrailAgent/ResolutionBanner',
  component: ResolutionBanner,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Shows the finalized guardrail negotiation outcome and approved parameters while clearly communicating that the result remains advisory.'
      }
    }
  }
};
export default meta;
type Story = StoryObj<typeof ResolutionBanner>;

const baseResolution: Omit<GuardrailResolution, 'outcome'> = {
  templateRef: 'template:default/database',
  fingerprint: 'assessment-7f3a',
  acceptedMutations: ['mutation-instance-type'],
  assessmentRef: 'artifact://guardrail-assessment/assessment-7f3a',
  decidedBy: 'user:default/alice',
  parameterHash: 'params-82c1'
};

/** Displays an accepted mutation and the approved parameter set from the resolution artifact. */
export const AcceptedMutation: Story = {
  args: {
    resolution: {
      ...baseResolution,
      outcome: 'accepted_mutation',
      approvedParameters: { instanceType: 'db.m5.large', multiAz: true }
    }
  } satisfies ResolutionBannerProps,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const banner = canvas.getByRole('status');
    await expect(banner).toBeInTheDocument();
    await expect(banner).toHaveTextContent('Negotiation outcome: accepted_mutation');
    await expect(banner).toHaveTextContent('"instanceType": "db.m5.large"');
    await expect(banner).toHaveTextContent('Advisory only: the Scaffolder backend does not enforce this result yet.');
  }
};

/** Displays an exception outcome when no approved parameter object accompanies the resolution. */
export const ExceptionGranted: Story = {
  args: {
    resolution: {
      ...baseResolution,
      outcome: 'granted_exception',
      acceptedMutations: []
    }
  } satisfies ResolutionBannerProps,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('status')).toHaveTextContent('Negotiation outcome: granted_exception');
    await expect(canvas.getByText(/Advisory only/)).toBeInTheDocument();
  }
};

/** Displays a halted negotiation outcome without presenting an approved parameter set. */
export const Halted: Story = {
  args: {
    resolution: {
      ...baseResolution,
      outcome: 'halted',
      acceptedMutations: []
    }
  } satisfies ResolutionBannerProps,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('status')).toHaveTextContent('Negotiation outcome: halted');
  }
};

/** Communicates that no resolution artifact has been produced yet. */
export const NoResolution: Story = {
  args: {} satisfies ResolutionBannerProps,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('status')).toHaveTextContent(
      'No guardrail resolution is available yet.'
    );
  }
};
