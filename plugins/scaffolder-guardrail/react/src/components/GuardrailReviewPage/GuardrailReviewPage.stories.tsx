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
  scaffolderGuardrailApiRef,
  type ScaffolderGuardrailApi
} from '../../api/apiRef';
import {
  GUARDRAIL_ASSESSMENT_ARTIFACT,
  GUARDRAIL_RESOLUTION_ARTIFACT
} from '../../hooks/useGuardrailRun';
import { GuardrailReviewPage } from './GuardrailReviewPage';
import type {
  AiRunEvent,
  GuardrailAssessment,
  GuardrailResolution
} from '../../@types';

const meta: Meta<typeof GuardrailReviewPage> = {
  title: 'Plugins/ScaffolderAiGuardrailAgent/GuardrailReviewPage',
  component: GuardrailReviewPage,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Standalone advisory review page for evaluating a Scaffolder template request, inspecting policy and budget findings, and responding to a backend-issued negotiation checkpoint.'
      }
    }
  }
};
export default meta;
type Story = StoryObj<typeof GuardrailReviewPage>;

const emptyEvents = async function* (): AsyncGenerator<AiRunEvent> {};

const runEvents = (...events: AiRunEvent[]) =>
  async function* (): AsyncGenerator<AiRunEvent> {
    yield* events;
  };

const assessment: GuardrailAssessment = {
  templateRef: 'template:default/database',
  fingerprint: 'assessment-7f3a',
  environment: 'production',
  status: 'negotiable',
  violations: [
    {
      id: 'instance-type-policy',
      policyId: 'approved-instance-types',
      rule: 'approved-instance-types',
      message: 'The requested instance type is larger than the approved production baseline.',
      parameter: 'instanceType',
      severity: 'negotiable',
      evidence: ['policy-1']
    }
  ],
  budget: {
    status: 'over_budget',
    currency: 'USD',
    amount: 1420,
    thresholdUsd: 1000,
    evidence: ['cost-1']
  },
  mutations: [
    {
      id: 'mutation-instance-type',
      parameter: 'instanceType',
      from: 'db.m5.16xlarge',
      to: 'db.m5.large',
      resolves: ['approved-instance-types', 'cost-ceiling'],
      projectedAmount: 180,
      rationale: 'Moves the request to the approved production instance type.'
    }
  ],
  confidence: 'high',
  limitations: ['The assessment is advisory; the Scaffolder backend does not enforce this result yet.'],
  evidence: [
    {
      id: 'policy-1',
      source: 'policy',
      summary: 'Production database requests must use an approved instance-type ladder.'
    },
    {
      id: 'cost-1',
      source: 'cost',
      summary: 'Estimated monthly cost exceeds the configured production ceiling.'
    }
  ]
};

const compliantAssessment: GuardrailAssessment = {
  ...assessment,
  fingerprint: 'assessment-compliant-1',
  status: 'compliant',
  violations: [],
  budget: {
    status: 'within_budget',
    currency: 'USD',
    amount: 180,
    thresholdUsd: 1000,
    evidence: ['cost-2']
  },
  mutations: [],
  limitations: [],
  evidence: [
    {
      id: 'policy-2',
      source: 'policy',
      summary: 'All submitted production parameters satisfy the configured guardrails.'
    }
  ]
};

const resolution: GuardrailResolution = {
  templateRef: assessment.templateRef,
  fingerprint: assessment.fingerprint,
  outcome: 'accepted_mutation',
  approvedParameters: { instanceType: 'db.m5.large' },
  acceptedMutations: ['mutation-instance-type'],
  assessmentRef: 'artifact://guardrail-assessment/assessment-7f3a',
  decidedBy: 'user:default/alice',
  parameterHash: 'params-82c1'
};
const createStoryApi = (
  streamRunEvents = emptyEvents,
  submitApproval = emptyEvents
): ScaffolderGuardrailApi =>
  createMockApi<ScaffolderGuardrailApi>({
    evaluateRequest: createMockFn(emptyEvents),
    streamRunEvents: createMockFn(streamRunEvents),
    submitApproval: createMockFn(submitApproval)
  });

const withApi = (api: ScaffolderGuardrailApi) => async () => ({
  mockApis: [[scaffolderGuardrailApiRef, api]]
});

const withRun = (api: ScaffolderGuardrailApi, runId: string) => ({
  loaders: [withApi(api)],
  parameters: { backstage: { routeEntries: [`/?run=${runId}`] } }
});

const artifactEvent = (
  runId: string,
  kind: string,
  artifact: GuardrailAssessment | GuardrailResolution
): AiRunEvent => ({
  type: 'artifact',
  data: { runId, kind, ref: JSON.stringify(artifact) }
});

/** Fresh page with no run in the URL; opens the evaluation request dialog. */
export const DefaultIdle: Story = {
  loaders: [withApi(createStoryApi())],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Evaluate request' }));

    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog).toBeVisible());
    await expect(screen.getByRole('heading', { name: 'Evaluate template request' })).toBeInTheDocument();
  }
};

/** A replayed evaluation that has entered policy and cost analysis but has not completed. */
export const EvaluationRunning: Story = {
  ...withRun(
    createStoryApi(
      runEvents(
        { type: 'step', data: { runId: 'run-guardrail-running', seq: 1, node: 'intake', phase: 'enter' } },
        { type: 'tool_result', data: { runId: 'run-guardrail-running', tool: 'policy.evaluate', ok: true, summary: 'Policy inputs normalized' } },
        { type: 'step', data: { runId: 'run-guardrail-running', seq: 2, node: 'estimate-cost', phase: 'enter' } }
      )
    ),
    'run-guardrail-running'
  )
};

/** A completed compliant assessment with no violations or mutation alternatives. */
export const Compliant: Story = {
  ...withRun(
    createStoryApi(
      runEvents(
        artifactEvent('run-guardrail-compliant', GUARDRAIL_ASSESSMENT_ARTIFACT, compliantAssessment),
        { type: 'done', data: { runId: 'run-guardrail-compliant' } }
      )
    ),
    'run-guardrail-compliant'
  )
};

/** A completed assessment showing policy violations, an over-budget estimate, and a safe alternative. */
export const NegotiationRequired: Story = {
  ...withRun(
    createStoryApi(
      runEvents(
        artifactEvent('run-guardrail-negotiation', GUARDRAIL_ASSESSMENT_ARTIFACT, assessment),
        {
          type: 'approval_request',
          data: {
            runId: 'run-guardrail-negotiation',
            approvalId: 'approval-1',
            reason: 'Accept the approved instance type mutation before continuing.',
            effect: 'read'
          }
        }
      )
    ),
    'run-guardrail-negotiation'
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('region', { name: 'Policy violations' })).toBeInTheDocument();
    await expect(canvas.getByRole('region', { name: 'Policy-derived alternatives' })).toBeInTheDocument();
    await expect(canvas.getByRole('region', { name: 'Guardrail negotiation' })).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Accept mutation' })).toBeInTheDocument();
  }
};

/** A finished negotiation with a server-issued resolution artifact and approved parameters. */
export const Resolved: Story = {
  ...withRun(
    createStoryApi(
      runEvents(
        artifactEvent('run-guardrail-resolved', GUARDRAIL_ASSESSMENT_ARTIFACT, assessment),
        artifactEvent('run-guardrail-resolved', GUARDRAIL_RESOLUTION_ARTIFACT, resolution),
        { type: 'done', data: { runId: 'run-guardrail-resolved' } }
      )
    ),
    'run-guardrail-resolved'
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('status')).toHaveTextContent('Negotiation outcome: accepted_mutation');
    await expect(canvas.getByText(/Advisory only/)).toBeInTheDocument();
  }
};

/** An unrecoverable evaluation error rendered in the page alert region. */
export const EvaluationError: Story = {
  ...withRun(
    createStoryApi(
      runEvents({
        type: 'error',
        data: {
          runId: 'run-guardrail-error',
          message: 'Policy service unavailable while evaluating template:default/database.'
        }
      })
    ),
    'run-guardrail-error'
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('alert')).toHaveTextContent('Policy service unavailable');
  }
};

