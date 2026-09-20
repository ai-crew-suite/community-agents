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

/**
 * Wire types for the Kubernetes AI responder frontend. These mirror the
 * backend responder and AI Core run-event contracts; they are duplicated here
 * because the backend packages are not isomorphic and must not be imported into
 * a frontend bundle.
 */

/** Deterministic failure signatures recognized by the triage graph. */
export type FailureClass =
  'oom-killed' | 'image-pull' | 'crash-loop' | 'rollout-exceeded' | 'unknown';

/** Systems an evidence observation can come from. */
export type IncidentEvidenceSource =
  'kubernetes' | 'vcs' | 'observability' | 'incident-management' | 'knowledge';

/** Trigger sources recognized by the responder. */
export type KubernetesIncidentTriggerSource =
  | 'alertmanager'
  | 'datadog'
  | 'pagerduty'
  | 'prometheus'
  | 'manual'
  | 'scheduler';

/** Versioned incident trigger consumed by the triage graph. */
export type KubernetesIncidentTrigger = {
  /** Trigger schema version. */
  version: 1;
  /** System that produced the incident signal. */
  source: KubernetesIncidentTriggerSource;
  /** ISO 8601 timestamp of the incident; normalized to UTC. */
  occurredAt: string;
  /** Catalog entity reference; an alternative to explicit workload coordinates. */
  entityRef?: string;
  cluster?: string;
  namespace?: string;
  workload?: string;
  pod?: string;
  alertId?: string;
  severity?: string;
  summary: string;
  /** Free-form alert labels. */
  labels?: Record<string, string>;
};

/** A single redacted, bounded evidence observation. */
export type IncidentEvidence = {
  /** Stable, unique evidence identifier used for report citations. */
  id: string;
  /** System the observation came from. */
  source: IncidentEvidenceSource;
  /** Evidence category, such as `workload`, `pod`, `log`, or `event`. */
  kind: string;
  /** ISO timestamp of the observation, when known. */
  observedAt?: string;
  /** Redacted, bounded human-readable summary. */
  summary: string;
  /** Optional stable reference (artifact ID, object coordinates, URL). */
  reference?: string;
  /** Confidence of the observation itself, not of a derived cause. */
  confidence?: 'high' | 'medium' | 'low';
};

/** Structured incident triage report persisted as a run artifact. */
export type IncidentTriageReport = {
  incidentId: string;
  entityRef?: string;
  /** Outcome of the investigation: completed, inconclusive, or failed. */
  status: 'investigated' | 'insufficient_evidence' | 'failed';
  /** Deterministic failure signature that routed the investigation. */
  failureClass: FailureClass;
  trigger: KubernetesIncidentTrigger;
  /** Likely causes, each citing retained evidence IDs; confidence is `0`–`1`. */
  likelyCauses: { summary: string; confidence: number; evidence: string[] }[];
  /** Normalized evidence bundle, sorted by observation time. */
  timeline: IncidentEvidence[];
  recommendedNextSteps: string[];
  /** Reasons the report is incomplete (budget, failures, caps, schema issues). */
  limitations: string[];
};

/**
 * Partial payload a manual investigation supplies. The backend normalizes this
 * into a full `KubernetesIncidentTrigger` (defaulting `source` to `manual` and
 * `occurredAt` to the current time), so callers supply only the known fields.
 *
 * A trigger must identify the incident target either by catalog `entityRef` or
 * by explicit workload coordinates (`cluster` + `namespace` + `workload`).
 */
export type ManualInvestigationInput = {
  entityRef?: string;
  cluster?: string;
  namespace?: string;
  workload?: string;
  pod?: string;
  summary?: string;
  severity?: string;
};

/** Run events streamed by AI Core (mirrors the backend `AgentEvent` union). */
export type AiRunEvent =
  | {
      type: 'step';
      data: {
        runId: string;
        seq: number;
        node: string;
        phase: 'enter' | 'exit';
      };
    }
  | { type: 'token'; data: { runId: string; text: string } }
  | { type: 'tool_call'; data: { runId: string; tool: string; args: unknown } }
  | {
      type: 'tool_result';
      data: {
        runId: string;
        tool: string;
        ok: boolean;
        summary?: string;
        output?: unknown;
      };
    }
  | {
      type: 'usage';
      data: { runId: string; input: number; output: number; total: number };
    }
  | {
      type: 'approval_request';
      data: {
        runId: string;
        approvalId: string;
        reason: string;
        effect: 'read' | 'write';
      };
    }
  | {
      type: 'artifact';
      data: { runId: string; kind: string; url?: string; ref?: string };
    }
  | { type: 'done'; data: { runId: string; sessionId?: string } }
  | { type: 'error'; data: { runId: string; message: string } };
