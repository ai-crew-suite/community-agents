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
import { FindingsPanel } from './FindingsPanel';
import type { FindingsPanelProps } from './FindingsPanel';
import type { Finding } from '../../@types';

const meta: Meta<typeof FindingsPanel> = {
  title: 'Plugins/ScaffolderAiInfra/FindingsPanel',
  component: FindingsPanel,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Displays deterministic validation findings with severity, source, optional generated-file path, and the user-facing validation message.'
      }
    }
  }
};
export default meta;
type Story = StoryObj<typeof FindingsPanel>;

const findings: Finding[] = [
  {
    id: 'security-public-ingress',
    file: 'main.tf',
    severity: 'blocking',
    source: 'security',
    message: 'Public ingress is forbidden for generated infrastructure.'
  },
  {
    id: 'syntax-placeholder',
    file: 'variables.tf',
    severity: 'blocking',
    source: 'syntax',
    message: 'The generated file contains an unresolved template placeholder.'
  },
  {
    id: 'policy-tagging',
    severity: 'advisory',
    source: 'policy',
    message: 'Add the recommended cost-center tag before submitting the preview.'
  }
];

/** Displays blocking and advisory findings from security, syntax, and policy validation. */
export const FindingsPresent: Story = {
  args: { findings } satisfies FindingsPanelProps,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const panel = canvas.getByRole('region', { name: 'Validation findings' });
    await expect(panel).toBeInTheDocument();
    await expect(canvas.getByText('blocking · security · main.tf')).toBeInTheDocument();
    await expect(
      canvas.getByText('Public ingress is forbidden for generated infrastructure.')
    ).toBeInTheDocument();
    await expect(canvas.getByText('blocking · syntax · variables.tf')).toBeInTheDocument();
    await expect(
      canvas.getByText('The generated file contains an unresolved template placeholder.')
    ).toBeInTheDocument();
    await expect(canvas.getByText('advisory · policy')).toBeInTheDocument();
    await expect(
      canvas.getByText('Add the recommended cost-center tag before submitting the preview.')
    ).toBeInTheDocument();
  }
};

/** Shows the validated empty state when generated files contain no findings. */
export const NoFindings: Story = {
  args: { findings: [] } satisfies FindingsPanelProps,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('region', { name: 'Validation findings' })).toBeInTheDocument();
    await expect(canvas.getByText('No validation findings were reported.')).toBeInTheDocument();
  }
};
