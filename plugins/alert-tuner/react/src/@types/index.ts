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

/** Browser wire types mirroring the non-isomorphic alert tuner backend contract. */
export type AlertTuningRequest = {
  version: 1;
  source: 'manual' | 'scheduler';
  alertId?: string;
  service?: string;
  entityRef?: string;
  windowDays?: number;
  repoUrl?: string;
  iacPath?: string;
  /** A future publish request; every write remains human approval-gated. */
  publish?: boolean;
};

/** Form values accepted by the evaluation client before request defaults are supplied. */
export type EvaluateAlertInput = Omit<AlertTuningRequest, 'version' | 'source'>;

/** One retained citation observation backing a proposal claim. */
export type EvidenceRef = {
  id: string;
  source: 'alert' | 'incident' | 'deploy' | 'metric' | 'iac' | 'knowledge';
  summary: string;
  reference?: string;
};

/** Deterministic alert-noise score computed by the backend. */
export type NoiseScore = {
  samples: number;
  autoResolveRatio: number;
  medianSelfClearSeconds: number;
  p90SelfClearSeconds: number;
  pagedRatio: number;
  verdict: 'noisy' | 'real_signal' | 'inconclusive';
  suppressedBy?: string[];
};

/** A precise threshold or duration line located in the owning IaC source. */
export type AnchorField = { value: string; line: number; raw: string };

/** Exact IaC location that made a proposal safe to derive. */
export type ThresholdAnchor = {
  path: string;
  blockName?: string;
  currentThreshold?: AnchorField;
  currentDuration?: AnchorField;
  evidence: string[];
};

/** One deterministic, capped source assignment change. */
export type ThresholdChange = {
  field: 'threshold' | 'duration';
  from: string;
  to: string;
  rationale: string;
};

/** Validated anchored unified diff emitted by the patch engine. */
export type FilePatch = { path: string; diff: string; patchHash: string };

/** First-class terminal outcome of an alert tuning evaluation. */
export type AlertTuningStatus =
  | 'noisy'
  | 'not_noisy'
  | 'insufficient_evidence'
  | 'anchor_not_found'
  | 'declined'
  | 'partial';

/** Reviewable proposal artifact emitted by the current proposal-only backend. */
export type AlertTuningProposal = {
  alertId: string;
  service?: string;
  status: AlertTuningStatus;
  window: { from: string; to: string };
  score?: NoiseScore;
  anchor?: ThresholdAnchor;
  changes: ThresholdChange[];
  patch?: FilePatch;
  confidence: 'high' | 'medium' | 'low';
  limitations: string[];
  evidence: EvidenceRef[];
};

/** Future publication result, retained for the approval UI contract. */
export type AlertTuningPublication = {
  alertId: string;
  repoUrl: string;
  pullRequestUrl: string;
  patchHash: string;
};

/** Human decision supplied only after AI Core emits a pending approval. */
export type ApprovalDecision = { status: 'approved' | 'rejected'; note?: string };

/** Standard AI Core SSE events understood by the alert tuning UI. */
export type AiRunEvent =
  | {
      type: 'step';
      data: { runId: string; seq: number; node: string; phase: 'enter' | 'exit' }
    }
  | {
      type: 'tool_call';
      data: { runId: string; tool: string; args: unknown }
    }
  | {
      type: 'tool_result';
      data: { runId: string; tool: string; ok: boolean; summary?: string }
    }
  | {
      type: 'approval_request';
      data: { runId: string; approvalId: string; reason: string; effect: 'read' | 'write' }
    }
  | {
      type: 'artifact';
      data: { runId: string; kind: string; ref?: string; url?: string }
    }
  | {
      type: 'done';
      data: { runId: string }
    }
  | {
      type: 'error';
      data: { runId: string; message: string }
    };
