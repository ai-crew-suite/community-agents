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
import type {
  AgentEvent,
  AgentRunInput,
  ArchitectureValidationResult,
  ApprovalDecision,
  CostEstimateResult,
  PolicyEvaluationResult,
  WorkflowContext,
  WorkflowRunner
} from '@ai-crew-suite/plugin-kernel-node';
import type { ScaffolderGuardrailConfig } from '../config';
import { assessmentArtifact, resolutionArtifact } from '../services/GuardrailArtifactWriter';
import { GuardrailToolRunner } from '../services/GuardrailToolRunner';
import { adjudicate } from './adjudicate';
import { fingerprintRequest } from './fingerprint';
import { GuardrailRequestValidationError, parseGuardrailQuery } from './intake';
import { proposeMutation } from './mutate';
import { price } from './price';
import type { GuardrailAssessment, GuardrailCheckpoint, GuardrailResolution } from './state';

/** Stable workflow identifier for Scaffolder guardrail negotiation. */
export const SCAFFOLDER_GUARDRAIL_WORKFLOW_ID = 'scaffolder-guardrail';

const assessmentStatus = (
  assessment: Pick<GuardrailAssessment, 'violations' | 'budget' | 'mutations'>,
): GuardrailAssessment['status'] => {
  if (assessment.budget?.status === 'undetermined') return 'undetermined';
  if (assessment.violations.some(item => item.severity === 'blocking')) return 'blocked';
  if (assessment.budget?.status === 'over_budget' && assessment.mutations.length === 0) return 'escalate';
  if (assessment.violations.length === 0 && assessment.budget?.status === 'within_budget') return 'compliant';
  return assessment.mutations.length > 0 ? 'negotiable' : 'blocked';
};

const resolutionOutcome = (
  accepted: boolean,
  hasMutation: boolean,
): GuardrailResolution['outcome'] => {
  if (!accepted) return 'halted';
  return hasMutation ? 'accepted_mutation' : 'granted_exception';
};

/** Deterministic advisory policy graph with a checkpointed parameter-negotiation gate. */
export class GuardrailGraph implements WorkflowRunner {
  readonly id = SCAFFOLDER_GUARDRAIL_WORKFLOW_ID;

  constructor(private readonly config: ScaffolderGuardrailConfig) {}

  async *run(input: AgentRunInput, context: WorkflowContext): AsyncIterable<AgentEvent> {
    let seq = 0;

    const step = (node: string, phase: 'enter' | 'exit'): AgentEvent => ({
      type: 'step',
      data: { runId: input.runId, seq: ++seq, node, phase }
    });

    let request;
    try {
      request = parseGuardrailQuery(
        input.input.query,
        input.trigger ? 'preflight' : 'manual',
        this.config.maxParameterBytes
      );
    } catch (error) {
      yield {
        type: 'error',
        data: {
          runId: input.runId,
          message: error instanceof GuardrailRequestValidationError || error instanceof Error
            ? error.message
            : String(error)
        }
      };
      return;
    }

    const fingerprint = fingerprintRequest(request);
    const tools = new GuardrailToolRunner(context, this.config.maxToolInvocations);
    const limitations = ['advisory-only: not enforced server-side'];

    yield step('adjudicate', 'enter');
    const policies: PolicyEvaluationResult[] = [];
    for (const policyId of this.config.policies) {
      const result = await tools.invoke<{ policyId: string; input: unknown }, PolicyEvaluationResult>(
        'compliance.policy.evaluate',
        { policyId, input: request.parameters }
      );
      if (result?.output) policies.push(result.output);
    }

    const architecture = await tools.invoke<{ proposal: unknown }, ArchitectureValidationResult>(
      'compliance.architecture.validate',
      { proposal: request.parameters }
    );
    yield step('adjudicate', 'exit');

    if (policies.length !== this.config.policies.length || !architecture?.output) {
      yield assessmentArtifact(input.runId, {
        templateRef: request.templateRef,
        fingerprint,
        environment: request.environment,
        status: 'undetermined',
        violations: [],
        mutations: [],
        confidence: 'low',
        limitations: [
          ...limitations,
          ...tools.limitations,
          'Compliance policy or architecture evaluation was unavailable.'
        ],
        evidence: []
      });
      yield { type: 'done', data: { runId: input.runId } };
      return;
    }

    const folded = adjudicate({
      policies,
      architecture: architecture.output,
      severity: this.config.severity
    });

    yield step('price', 'enter');
    const estimate = await tools.invoke<{ proposal: unknown }, CostEstimateResult>(
      'compliance.cost.estimate',
      { proposal: request.parameters }
    );
    const threshold = this.config.perEnvironment[request.environment ?? ''] ?? this.config.thresholdUsd;
    const priced = price(estimate?.output, threshold);
    yield step('price', 'exit');

    const hasBlocking = folded.violations.some(item => item.severity === 'blocking');
    const mutations = hasBlocking
      ? []
      : proposeMutation({
          parameters: request.parameters,
          violations: folded.violations,
          ladder: this.config.instanceTypeByEnvironment[request.environment ?? ''] ?? this.config.instanceTypeLadder
        });

    const status = assessmentStatus({
      violations: folded.violations,
      budget: priced.budget,
      mutations,
    });

    const assessment: GuardrailAssessment = {
      templateRef: request.templateRef,
      fingerprint,
      environment: request.environment,
      status,
      violations: folded.violations,
      budget: priced.budget,
      mutations,
      confidence: tools.limitations.length || priced.limitation ? 'low' : 'high',
      limitations: [...limitations, ...tools.limitations, ...(priced.limitation ? [priced.limitation] : [])],
      evidence: [...folded.evidence, ...priced.evidence]
    };

    yield assessmentArtifact(input.runId, assessment);

    if (status === 'negotiable' || status === 'escalate') {
      if (context.checkpointStore) {
        await context.checkpointStore.save(input.runId, {
          request,
          assessment,
          canonicalParameters: request.parameters
        } satisfies GuardrailCheckpoint);
      }
      yield {
        type: 'approval_request',
        data: {
          runId: input.runId,
          approvalId: `guardrail-${fingerprint}`,
          reason: 'Accept a policy-derived parameter mutation or request an authorized exception.',
          effect: 'read'
        }
      };
      return;
    }

    yield { type: 'done', data: { runId: input.runId } };
  }

  /**
   * Resolves a checkpointed negotiation after an explicit human decision.
   * Permission is checked through the compliance driver before any parameter
   * set is released, even though this workflow owns no write-capable tool.
   */
  async *resume(
    runId: string,
    decision: ApprovalDecision,
    context: WorkflowContext,
  ): AsyncIterable<AgentEvent> {
    const checkpoint = await context.checkpointStore?.load<GuardrailCheckpoint>(runId);
    if (!checkpoint) {
      yield { type: 'error', data: { runId, message: 'No pending guardrail negotiation checkpoint exists.' } };
      return;
    }

    const actor = decision.decidedBy ?? context.identity ?? 'unknown';
    const permission = await new GuardrailToolRunner(context, 1).invoke<
      { userRef: string; action: string; resource: string },
      { allowed: boolean; reason?: string }
    >('compliance.permission.check', {
      userRef: actor,
      action: checkpoint.assessment.status === 'escalate' ? 'guardrail.exception' : 'guardrail.mutation.accept',
      resource: checkpoint.request.templateRef,
    });

    if (!permission?.output.allowed) {
      await context.auditLogSink?.recordWriteAction({
        id: `guardrail-refused-${runId}`,
        runId,
        agentId: 'scaffolder-ai-guardrail-agent',
        action: 'approval_refused',
        actor,
        payload: { templateRef: checkpoint.request.templateRef, reason: permission?.output.reason },
      });
      yield {
        type: 'error',
        data: {
          runId,
          message: permission?.output.reason ?? 'Approver is not authorized for this guardrail decision.'
        }
      };
      return;
    }

    const accepted = decision.status === 'approved';
    const mutation = checkpoint.assessment.mutations[0];
    const approvedParameters = accepted && mutation
      ? { ...checkpoint.canonicalParameters, [mutation.parameter]: mutation.to }
      : undefined;

    const outcome = resolutionOutcome(accepted, Boolean(mutation));

    const resolution: GuardrailResolution = {
      templateRef: checkpoint.request.templateRef,
      fingerprint: checkpoint.assessment.fingerprint,
      outcome,
      approvedParameters,
      acceptedMutations: accepted && mutation ? [mutation.id] : [],
      assessmentRef: JSON.stringify(checkpoint.assessment),
      decidedBy: actor,
      parameterHash: fingerprintRequest({ ...checkpoint.request, parameters: approvedParameters ?? checkpoint.canonicalParameters })
    };

    yield resolutionArtifact(runId, resolution);
    yield { type: 'done', data: { runId } };
  }
}
