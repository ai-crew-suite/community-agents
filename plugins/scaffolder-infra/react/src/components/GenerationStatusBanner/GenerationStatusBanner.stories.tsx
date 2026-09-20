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
import { GenerationStatusBanner } from './GenerationStatusBanner';
import type { GenerationStatusBannerProps } from './GenerationStatusBanner';
import type { InfraGenerationReport } from '../../@types';

const meta: Meta<typeof GenerationStatusBanner> = {
  title: 'Plugins/ScaffolderAiInfra/GenerationStatusBanner',
  component: GenerationStatusBanner,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'States the infrastructure preview outcome while explicitly distinguishing preview generation from Scaffolder workspace writes and provisioning.'
      }
    }
  }
};
export default meta;
type Story = StoryObj<typeof GenerationStatusBanner>;

const createReport = (
  status: InfraGenerationReport['status']
): InfraGenerationReport => ({
  serviceName: 'payments-api',
  provider: 'terraform',
  role: 'terraform-expert',
  status,
  files: [],
  findings: [],
  corrections: 0,
  limitations: [],
  evidence: []
});

/** Shows a successfully generated preview and its non-writing safety boundary. */
export const Generated: Story = {
  args: { report: createReport('generated') } satisfies GenerationStatusBannerProps,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const banner = canvas.getByRole('status');
    await expect(banner).toBeInTheDocument();
    await expect(banner).toHaveTextContent('Preview status: generated');
    await expect(banner).toHaveTextContent(
      'This AI Core preview never writes files or provisions infrastructure.'
    );
    await expect(banner).toHaveTextContent(
      'Workspace writes occur only inside the Scaffolder action.'
    );
  }
};

/** Shows a validation failure status while retaining the preview-only warning. */
export const ValidationFailed: Story = {
  args: { report: createReport('validation_failed') } satisfies GenerationStatusBannerProps,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('status')).toHaveTextContent('Preview status: validation_failed');
    await expect(canvas.getByText(/never writes files or provisions infrastructure/)).toBeInTheDocument();
  }
};

/** Shows a partial generation outcome that is not equivalent to a completed write. */
export const Partial: Story = {
  args: { report: createReport('partial') } satisfies GenerationStatusBannerProps,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('status')).toHaveTextContent('Preview status: partial');
  }
};

/** Shows the explicit unavailable-blueprint outcome from the preview backend. */
export const BlueprintUnavailable: Story = {
  args: { report: createReport('blueprint_unavailable') } satisfies GenerationStatusBannerProps,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('status')).toHaveTextContent(
      'Preview status: blueprint_unavailable'
    );
  }
};
