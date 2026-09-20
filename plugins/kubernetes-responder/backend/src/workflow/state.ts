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
  KubernetesWorkloadRef,
  KubernetesWorkloadSnapshot,
} from '@ai-crew-suite/plugin-kernel-node';
import type { FailureClass } from './routing';

/**
 * Versioned incident trigger payload accepted from webhooks, schedulers, and
 * manual runs.
 */
export type KubernetesIncidentTrigger = {
  /** Trigger schema version. */
  version: 1;
  /** System that produced the incident signal. */
  source:
    | 'alertmanager'
    | 'datadog'
    | 'pagerduty'
    | 'prometheus'
    | 'manual'
    | 'scheduler';
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
  /** Free-form alert labels, capped in count and value length. */
  labels?: Record<string, string>;
};

/**
 * A single redacted, bounded evidence observation. Evidence is the only
 * content allowed into model context and the only valid citation target in a
 * report.
 */
export type IncidentEvidence = {
  /** Stable, unique evidence identifier used for report citations. */
  id: string;
  /** System the observation came from. */
  source: 'kubernetes' | 'vcs' | 'observability' | 'incident-management' | 'knowledge';
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

/**
 * Structured incident triage report persisted as a run artifact.
 */
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
 * Mutable state threaded through the triage graph nodes.
 */
export type InvestigationState = {
  trigger: KubernetesIncidentTrigger;
  /** Resolved workload target, if one was found. */
  workload?: KubernetesWorkloadRef;
  /** Latest workload snapshot, if one was collected. */
  snapshot?: KubernetesWorkloadSnapshot;
  /** Deterministic failure class, set after snapshot classification. */
  failureClass?: FailureClass;
  evidence: IncidentEvidence[];
  limitations: string[];
};
