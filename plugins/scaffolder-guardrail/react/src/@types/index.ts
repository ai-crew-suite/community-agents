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
/** Browser wire types mirroring the advisory guardrail backend. */
export type GuardrailRequest = {
  version: 1;
  source: 'manual' | 'preflight';
  templateRef: string;
  parameters: Record<string, unknown>;
  environment?: string;
  requestedBy?: string;
  sessionId?: string;
};

/** Form inputs accepted by the client before system attributes are appended. */
export type EvaluateRequestInput = Omit<GuardrailRequest, 'version' | 'source'>;

/** Retained citable observation backing a governance or policy claim. */
export type EvidenceRef = {
  id: string;
  source: 'policy' | 'architecture' | 'cost' | 'knowledge';
  summary: string;
  reference?: string;
};

/** Classification of a deterministic policy, architecture, or resource violation. */
export type PolicyViolation = {
  id: string;
  policyId?: string;
  rule: string;
  message: string;
  parameter?: string;
  severity: 'blocking' | 'negotiable' | 'advisory';
  evidence: string[];
};

/** Budget calculation comparing estimate thresholds against a strict policy ceiling. */
export type BudgetVerdict = {
  status: 'within_budget' | 'over_budget' | 'undetermined';
  currency?: string;
  amount?: number;
  ceiling?: number;
  thresholdUsd?: number;
  evidence: string[];
};

/** Configured alternative offered automatically to resolve a negotiable policy violation. */
export type MutationProposal = {
  id: string;
  parameter: string;
  from: unknown;
  to: unknown;
  resolves: string[];
  projectedAmount?: number;
  rationale: string;
};

/** Completed assessment carrying evaluation data, alternative proposals, and active violations. */
export type GuardrailAssessment = {
  templateRef: string;
  fingerprint: string;
  environment?: string;
  status: 'compliant' | 'negotiable' | 'escalate' | 'blocked' | 'undetermined' | 'resolved' | 'halted';
  violations: PolicyViolation[];
  budget?: BudgetVerdict;
  mutations: MutationProposal[];
  confidence: 'high' | 'medium' | 'low';
  limitations: string[];
  evidence: EvidenceRef[];
};

/** Finalized consensus output tracking approved parameters or exceptions. */
export type GuardrailResolution = {
  templateRef: string;
  fingerprint: string;
  outcome: 'accepted_mutation' | 'granted_exception' | 'halted';
  approvedParameters?: Record<string, unknown>;
  acceptedMutations: string[];
  assessmentRef: string;
  decidedBy: string;
  parameterHash: string;
};

/** Explicit human decision emitted after an approval gate is prompted. */
export type ApprovalDecision = {
  status: 'approved' | 'rejected';
  note?: string;
};

/** Streaming timeline event received from the asynchronous AI Core connection. */
export type AiRunEvent =
  | {
      /** Emitted when an orchestration node is entered or exited. */
      type: 'step';
      data: { runId: string; seq: number; node: string; phase: 'enter' | 'exit' };
    }
  | {
      /** Emitted when a tool invocation is initiated by the agent runner. */
      type: 'tool_call';
      data: { runId: string; tool: string; args: unknown };
    }
  | {
      /** Emitted when a tool execution completes and passes back structured output. */
      type: 'tool_result';
      data: { runId: string; tool: string; ok: boolean; summary?: string };
    }
  | {
      /** Emitted when a checkpointed negotiation pauses for human authorization. */
      type: 'approval_request';
      data: { runId: string; approvalId: string; reason: string; effect: 'read' | 'write' };
    }
  | {
      /** Emitted when a finalized report or schema state is saved by the runner. */
      type: 'artifact';
      data: { runId: string; kind: string; ref?: string; url?: string };
    }
  | {
      /** Terminal lifecycle indicator marking a successful workflow conclusion. */
      type: 'done';
      data: { runId: string };
    }
  | {
      /** Terminal lifecycle indicator marking a failed run or unrecoverable error. */
      type: 'error';
      data: { runId: string; message: string };
    };
