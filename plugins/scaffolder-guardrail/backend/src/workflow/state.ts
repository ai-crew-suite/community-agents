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

/** Versioned advisory pre-flight request for one Scaffolder template submission. */
export type GuardrailRequest = {
  version: 1;
  source: 'manual' | 'preflight';
  templateRef: string;
  parameters: Record<string, unknown>;
  environment?: string;
  requestedBy?: string;
  sessionId?: string;
};

/** Retained factual observation supporting a policy, architecture, or cost claim. */
export type EvidenceRef = {
  id: string;
  source: 'policy' | 'architecture' | 'cost' | 'knowledge';
  summary: string;
  reference?: string;
};

/** Deterministically classified driver violation. */
export type PolicyViolation = {
  id: string;
  policyId?: string;
  rule: string;
  message: string;
  parameter?: string;
  severity: 'blocking' | 'negotiable' | 'advisory';
  evidence: string[];
};

/** Budget comparison derived exclusively from the compliance cost result. */
export type BudgetVerdict = {
  status: 'within_budget' | 'over_budget' | 'undetermined';
  currency?: string;
  amount?: number;
  ceiling?: number;
  thresholdUsd?: number;
  evidence: string[];
};

/** Config-bounded alternative offered only after deterministic evaluation. */
export type MutationProposal = {
  id: string;
  parameter: string;
  from: unknown;
  to: unknown;
  resolves: string[];
  projectedAmount?: number;
  rationale: string;
};

/** Persisted advisory assessment, never a server-side Scaffolder enforcement result. */
export type GuardrailAssessment = {
  templateRef: string;
  fingerprint: string;
  environment?: string;
  status:
    | 'compliant'
    | 'negotiable'
    | 'escalate'
    | 'blocked'
    | 'undetermined'
    | 'resolved'
    | 'halted';
  violations: PolicyViolation[];
  budget?: BudgetVerdict;
  mutations: MutationProposal[];
  confidence: 'high' | 'medium' | 'low';
  limitations: string[];
  evidence: EvidenceRef[];
};

/** Approved or halted negotiation outcome for a future Scaffolder caller. */
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

/** Checkpointed state needed to authorize a resume without recomputing a proposal. */
export type GuardrailCheckpoint = {
  request: GuardrailRequest;
  assessment: GuardrailAssessment;
  canonicalParameters: Record<string, unknown>;
};
