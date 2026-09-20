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
import { expect, screen, userEvent, waitFor, within } from 'storybook/test';
import { createMockApi, createMockFn } from '@ai-crew-suite/cli/storybook/mocks';
import { scaffolderInfraApiRef, type ScaffolderInfraApi } from '../../api/apiRef';
import { INFRA_GENERATION_REPORT_ARTIFACT } from '../../hooks/useInfraRun';
import { InfraPreviewPage } from './InfraPreviewPage';
import type { AiRunEvent, InfraGenerationReport } from '../../@types';

const meta: Meta<typeof InfraPreviewPage> = {
  title: 'Plugins/ScaffolderAiInfra/InfraPreviewPage',
  component: InfraPreviewPage,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Standalone non-writing infrastructure preview page that replays generation events and displays file metadata, validation findings, correction counts, limitations, and retained evidence.'
      }
    }
  }
};
export default meta;
type Story = StoryObj<typeof InfraPreviewPage>;

const report: InfraGenerationReport = {
  serviceName: 'payments-api',
  provider: 'terraform',
  role: 'terraform-expert',
  status: 'generated',
  blueprintId: 'terraform-service-v2',
  blueprintSource: 'platform-blueprints/terraform-service-v2',
  files: [
    { path: 'main.tf', bytes: 1842, dialect: 'hcl' },
    { path: 'variables.tf', bytes: 612, dialect: 'hcl' }
  ],
  findings: [
    {
      id: 'public-ingress',
      file: 'main.tf',
      severity: 'advisory',
      source: 'security',
      message: 'Ingress is restricted to the private network boundary.'
    }
  ],
  corrections: 2,
  limitations: [
    'The preview exposes metadata only; generated content remains in the action sandbox.'
  ],
  evidence: [
    {
      id: 'blueprint-1',
      source: 'blueprint',
      summary: 'Terraform service blueprint selected for the payments API.',
      reference: 'blueprint://terraform-service-v2'
    }
  ]
};

const failedReport: InfraGenerationReport = {
  ...report,
  status: 'validation_failed',
  files: [],
  findings: [
    {
      id: 'unresolved-hole',
      file: 'main.tf',
      severity: 'blocking',
      source: 'syntax',
      message: 'The generated file contains an unresolved template placeholder.'
    }
  ],
  corrections: 3,
  limitations: ['No valid files remained after the bounded correction loop.']
};

const stream = (...events: AiRunEvent[]) =>
  async function* (): AsyncGenerator<AiRunEvent> {
    yield* events;
  };

const reportEvent = (runId: string, value: InfraGenerationReport): AiRunEvent => ({
  type: 'artifact',
  data: { runId, kind: INFRA_GENERATION_REPORT_ARTIFACT, ref: JSON.stringify(value) }
});

const createStoryApi = (
  previewGeneration = stream(),
  streamRunEvents = stream()
): ScaffolderInfraApi =>
  createMockApi<ScaffolderInfraApi>({
    previewGeneration: createMockFn(previewGeneration),
    streamRunEvents: createMockFn(streamRunEvents)
  });

const withApi = (api: ScaffolderInfraApi) => async () => ({
  mockApis: [[scaffolderInfraApiRef, api]]
});

const withRun = (api: ScaffolderInfraApi, runId: string) => ({
  loaders: [withApi(api)],
  parameters: { backstage: { routeEntries: [`/?run=${runId}`] } }
});
/** Shows the untouched page and opens the non-writing preview form. */
export const Idle: Story = {
  loaders: [withApi(createStoryApi())],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Preview generation' })).toBeEnabled();
    await userEvent.click(canvas.getByRole('button', { name: 'Preview generation' }));

    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog).toBeVisible());
    await expect(
      screen.getByRole('heading', { name: 'Preview infrastructure generation' })
    ).toBeInTheDocument();
  }
};

/** Replays a completed generated preview with files, findings, corrections, limitations, and evidence. */
export const GeneratedPreview: Story = {
  ...withRun(
    createStoryApi(
      stream(),
      stream(
        { type: 'step', data: { runId: 'run-generated-1', seq: 1, node: 'generate', phase: 'enter' } },
        { type: 'step', data: { runId: 'run-generated-1', seq: 2, node: 'validate', phase: 'exit' } },
        reportEvent('run-generated-1', report),
        { type: 'done', data: { runId: 'run-generated-1' } }
      )
    ),
    'run-generated-1'
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.findByText('payments-api · terraform')).resolves.toBeInTheDocument();
    await expect(canvas.getByRole('status')).toHaveTextContent('Preview status: generated');
    await expect(canvas.getByRole('region', { name: 'Generated file manifest' })).toBeInTheDocument();
    await expect(canvas.getByRole('region', { name: 'Validation findings' })).toBeInTheDocument();
    await expect(canvas.getByRole('region', { name: 'Correction timeline' })).toHaveTextContent(
      '2 correction round(s) completed.'
    );
    await expect(canvas.getByText(/content remains in the action sandbox/)).toBeInTheDocument();
    await expect(
      canvas.getByText(/Terraform service blueprint selected for the payments API\./)
    ).toBeInTheDocument();
  }
};

/** Shows an in-progress preview while generation has not produced a report artifact. */
export const Generating: Story = {
  ...withRun(
    createStoryApi(
      stream(),
      stream({
        type: 'step',
        data: { runId: 'run-generating-1', seq: 1, node: 'generate', phase: 'enter' }
      })
    ),
    'run-generating-1'
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('progress')).toBeInTheDocument();
  }
};

/** Replays a failed preview with blocking validation findings and no valid file manifest. */
export const ValidationFailed: Story = {
  ...withRun(
    createStoryApi(
      stream(),
      stream(reportEvent('run-validation-failed-1', failedReport), {
        type: 'done',
        data: { runId: 'run-validation-failed-1' }
      })
    ),
    'run-validation-failed-1'
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('status')).toHaveTextContent('Preview status: validation_failed');
    await expect(canvas.getByText('No valid file manifest was produced.')).toBeInTheDocument();
    await expect(canvas.getByText('blocking · syntax · main.tf')).toBeInTheDocument();
  }
};

/** Shows a preview failure in the page alert region without an available report artifact. */
export const PreviewError: Story = {
  ...withRun(
    createStoryApi(
      stream(),
      stream({
        type: 'error',
        data: {
          runId: 'run-preview-error-1',
          message: 'Preview generation failed: blueprint service unavailable.'
        }
      })
    ),
    'run-preview-error-1'
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('alert')).toHaveTextContent('blueprint service unavailable');
  }
};

