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
import { GeneratedFileList } from './GeneratedFileList';
import type { GeneratedFileListProps } from './GeneratedFileList';
import type { InfraGenerationReport } from '../../@types';

const meta: Meta<typeof GeneratedFileList> = {
  title: 'Plugins/ScaffolderAiInfra/GeneratedFileList',
  component: GeneratedFileList,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Shows the metadata manifest for generated infrastructure files while keeping action-sandbox content out of the browser report.'
      }
    }
  }
};
export default meta;
type Story = StoryObj<typeof GeneratedFileList>;

const reportWithFiles: InfraGenerationReport = {
  serviceName: 'payments-api',
  provider: 'terraform',
  role: 'terraform-expert',
  status: 'generated',
  blueprintId: 'terraform-service-v2',
  files: [
    { path: 'main.tf', bytes: 1842, dialect: 'hcl' },
    { path: 'variables.tf', bytes: 612, dialect: 'hcl' },
    { path: 'outputs.tf.json', bytes: 388, dialect: 'json' }
  ],
  findings: [],
  corrections: 1,
  limitations: [],
  evidence: []
};

const emptyReport: InfraGenerationReport = {
  serviceName: 'payments-api',
  provider: 'terraform',
  role: 'terraform-expert',
  status: 'validation_failed',
  files: [],
  findings: [],
  corrections: 0,
  limitations: ['No valid files remained after validation.'],
  evidence: []
};

/** Displays a generated file manifest with path, dialect, and byte metadata. */
export const FilesPresent: Story = {
  args: { report: reportWithFiles } satisfies GeneratedFileListProps,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const manifest = canvas.getByRole('region', { name: 'Generated file manifest' });
    await expect(manifest).toBeInTheDocument();
    await expect(canvas.getByText('main.tf · hcl · 1842 bytes')).toBeInTheDocument();
    await expect(canvas.getByText('variables.tf · hcl · 612 bytes')).toBeInTheDocument();
    await expect(canvas.getByText('outputs.tf.json · json · 388 bytes')).toBeInTheDocument();
    await expect(
      canvas.getByText(
        'Preview artifacts retain file metadata only; content stays in the Scaffolder workspace action sandbox.'
      )
    ).toBeInTheDocument();
  }
};

/** Shows the validation-failure state when no valid file manifest was produced. */
export const NoFiles: Story = {
  args: { report: emptyReport } satisfies GeneratedFileListProps,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('region', { name: 'Generated file manifest' })).toBeInTheDocument();
    await expect(canvas.getByText('No valid file manifest was produced.')).toBeInTheDocument();
    await expect(canvas.getByText(/content stays in the Scaffolder workspace action sandbox/)).toBeInTheDocument();
  }
};
