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
import {
  driftDetectorApiRef,
  DRIFT_REPORT_ARTIFACT,
  type DriftDetectorApi
} from '@ai-crew-suite/plugin-agent-scaffolder-drift-detector';
import { DriftDashboardPage } from './DriftDashboardPage';
import type { AiRunEvent, DriftReport } from '../../@types';

const meta: Meta<typeof DriftDashboardPage> = {
  title: 'Plugins/ScaffolderAiDriftDetector/DriftDashboardPage',
  component: DriftDashboardPage,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Standalone drift report page. Each story replays a deterministic run-event stream through the typed drift detector API, so the states below match what the read-only Kubernetes-backed backend can actually emit.'
      }
    }
  }
};
export default meta;
type Story = StoryObj<typeof DriftDashboardPage>;

const emptyEvents = async function* (): AsyncGenerator<AiRunEvent> {};

const runEvents = (...events: AiRunEvent[]) =>
  async function* (): AsyncGenerator<AiRunEvent> {
    yield* events;
  };

const driftedReport: DriftReport = {
  entityRef: 'component:default/payments-api',
  status: 'drifted',
  items: [
    {
      id: 'spec-replicas',
      field: 'spec.replicas',
      expected: { value: 3, evidence: ['blueprint-1'] },
      actual: { value: 1, evidence: ['live-1'] },
      severity: 'critical'
    },
    {
      id: 'container-image',
      field: 'container.image',
      expected: { value: 'ghcr.io/acme/payments-api:1.8.0', evidence: ['blueprint-1'] },
      actual: { value: 'ghcr.io/acme/payments-api:1.6.3', evidence: ['live-1'] },
      severity: 'major'
    },
    {
      id: 'limits-cpu',
      field: 'resources.limits.cpu',
      expected: { value: '500m', evidence: ['blueprint-1'] },
      actual: { value: undefined, evidence: ['live-1'] },
      severity: 'minor'
    }
  ],
  limitations: [
    'Only the bounded blueprint fields supplied in the request are compared.',
    'Remediation is out of scope for the current read-only milestone.'
  ],
  evidence: [
    {
      id: 'blueprint-1',
      source: 'blueprint',
      summary: 'Temporary request blueprint: 3 replicas of ghcr.io/acme/payments-api:1.8.0.'
    },
    {
      id: 'live-1',
      source: 'live',
      summary: 'Kubernetes deployment payments-api in namespace payments reports 1 ready replica.',
      reference: 'k8s://prod/payments/deployment/payments-api'
    }
  ]
};

const inSyncReport: DriftReport = {
  entityRef: 'component:default/checkout-api',
  status: 'in_sync',
  items: [],
  limitations: ['Only the bounded blueprint fields supplied in the request are compared.'],
  evidence: [
    {
      id: 'live-1',
      source: 'live',
      summary:
        'Kubernetes deployment checkout-api matches the requested blueprint on every compared field.'
    }
  ]
};

const createStoryApi = (streamRunEvents = emptyEvents): DriftDetectorApi =>
  createMockApi<DriftDetectorApi>({
    checkDrift: createMockFn(emptyEvents),
    streamRunEvents: createMockFn(streamRunEvents),
    submitApproval: createMockFn(emptyEvents)
  });

const withApi = (api: DriftDetectorApi) => async () => ({
  mockApis: [[driftDetectorApiRef, api]]
});

const withRun = (api: DriftDetectorApi, runId: string) => ({
  loaders: [withApi(api)],
  parameters: { backstage: { routeEntries: [`/?run=${runId}`] } }
});

const reportEvent = (runId: string, report: DriftReport): AiRunEvent => ({
  type: 'artifact',
  data: { runId, kind: DRIFT_REPORT_ARTIFACT, ref: JSON.stringify(report) }
});

/** Fresh page with no run in the URL; opens the bounded on-demand check dialog. */
export const DefaultIdle: Story = {
  loaders: [withApi(createStoryApi())],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Run drift check' }));

    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog).toBeVisible());
    await userEvent.type(
      screen.getByLabelText('Catalog entity reference'),
      'component:default/payments-api'
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Check drift' })).toBeEnabled()
    );
  }
};

/** A replayed run that has started emitting graph steps but has not reported yet. */
export const CheckRunning: Story = {
  ...withRun(
    createStoryApi(
      runEvents(
        { type: 'step', data: { runId: 'run-drift-running', seq: 1, node: 'read-blueprint', phase: 'enter' } },
        { type: 'tool_result', data: { runId: 'run-drift-running', tool: 'kubernetes.workload.read', ok: true, summary: '1 deployment resolved' } },
        { type: 'step', data: { runId: 'run-drift-running', seq: 2, node: 'compare-fields', phase: 'enter' } }
      )
    ),
    'run-drift-running'
  )
};

/** A finished run whose report contains per-field drift with paired blueprint and live citations. */
export const DriftDetected: Story = {
  ...withRun(
    createStoryApi(
      runEvents(
        reportEvent('run-drift-detected', driftedReport),
        { type: 'done', data: { runId: 'run-drift-detected' } }
      )
    ),
    'run-drift-detected'
  )
};

/** A finished run where every compared field matches the bounded blueprint. */
export const InSync: Story = {
  ...withRun(
    createStoryApi(
      runEvents(
        reportEvent('run-drift-in-sync', inSyncReport),
        { type: 'done', data: { runId: 'run-drift-in-sync' } }
      )
    ),
    'run-drift-in-sync'
  )
};

/** An error surfaced from the streamed drift check, rendered in the page alert region. */
export const CheckError: Story = {
  ...withRun(
    createStoryApi(
      runEvents({
        type: 'error',
        data: {
          runId: 'run-drift-error',
          message:
            'Failed to read live state: the Kubernetes cluster locator returned no workload for component:default/payments-api.'
        }
      })
    ),
    'run-drift-error'
  )
};
