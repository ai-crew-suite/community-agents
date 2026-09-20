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
 * Versioned request selecting one alert definition, or one service's alert set,
 * for a bounded trailing analysis window.
 */
export type AlertTuningRequest = {
  version: 1;
  source: 'manual' | 'scheduler';
  /** Single alert definition to evaluate; required when `service` is absent. */
  alertId?: string;
  /** Service scope used when no explicit `alertId` is supplied. */
  service?: string;
  /** Optional catalog component supplying ownership and source annotations. */
  entityRef?: string;
  /** Trailing analysis window in days, clamped by configuration. */
  windowDays?: number;
  /** Infrastructure repository override; otherwise resolved from annotations. */
  repoUrl?: string;
  /** Exact IaC file path; otherwise discovered through repository search. */
  iacPath?: string;
  /** Requests the pull-request path, which always remains approval-gated. */
  publish?: boolean;
};

/** One bounded evidence observation available for citation. */
export type EvidenceRef = {
  /** Stable citation identifier such as `fire-1`, `inc-1`, or `iac-1`. */
  id: string;
  /** System the observation came from. */
  source: 'alert' | 'incident' | 'deploy' | 'metric' | 'iac' | 'knowledge';
  /** Redacted, bounded human-readable summary. */
  summary: string;
  /** Optional stable reference such as a deep link or file path. */
  reference?: string;
};

/**
 * One normalized firing of an alert definition. Durations are derived from the
 * trigger and resolve timestamps rather than trusted from the provider.
 */
export type FiringSample = {
  /** Stable citation identifier (`fire-N`). */
  id: string;
  /** ISO-8601 timestamp the alert fired. */
  triggeredAt: string;
  /** ISO-8601 timestamp the alert cleared, when it did. */
  resolvedAt?: string;
  /** Derived lifetime in seconds; absent for unresolved firings. */
  durationSeconds?: number;
  /** Whether the firing cleared itself or required a responder. */
  resolution: 'auto' | 'manual' | 'unresolved';
  /** Whether the firing paged a human rather than only being recorded. */
  paged: boolean;
};

/**
 * Deterministic noise statistics for one alert definition. Every field is
 * computed in pure code; the model may never alter these numbers or restate
 * them differently.
 */
export type NoiseScore = {
  /** Total firings considered, including unresolved ones. */
  samples: number;
  /** Share of resolved firings that cleared without a responder, 0..1. */
  autoResolveRatio: number;
  /** Median self-clear duration in seconds across auto-resolved firings. */
  medianSelfClearSeconds: number;
  /** 90th-percentile self-clear duration, used to derive the safety cap. */
  p90SelfClearSeconds: number;
  /** Share of firings that paged a human, 0..1. */
  pagedRatio: number;
  /** Fixed verdict derived from the statistics above. */
  verdict: 'noisy' | 'real_signal' | 'inconclusive';
  /** Evidence IDs of incidents or deploys that ruled the candidate out. */
  suppressedBy?: string[];
};

/** One located assignment line inside the owning IaC file. */
export type AnchorField = {
  /** Parsed value of the assignment. */
  value: string;
  /** One-based line number inside the read file. */
  line: number;
  /** Exact source line, preserved byte-for-byte for patching. */
  raw: string;
};

/**
 * The precise location of an alert definition's tunable values inside one IaC
 * file. Ambiguous matches are never represented here; they terminate the run.
 */
export type ThresholdAnchor = {
  /** Repository-relative file path holding the alert definition. */
  path: string;
  /** Matched block name, such as `prometheus_alert.cpu_high`. */
  blockName?: string;
  /** Located numeric threshold assignment, when the block defines one. */
  currentThreshold?: AnchorField;
  /** Located duration assignment such as `for = "2m"`, when present. */
  currentDuration?: AnchorField;
  /** Evidence IDs (`iac-N`) backing the anchor. */
  evidence: string[];
};

/** One capped value change proposed for a located assignment line. */
export type ThresholdChange = {
  /** Which located assignment the change applies to. */
  field: 'threshold' | 'duration';
  /** Current value, quoted from the anchor. */
  from: string;
  /** Proposed value; always within the configured caps. */
  to: string;
  /** Deterministic explanation naming the statistics that justify the change. */
  rationale: string;
};

/** An anchored unified diff validated to apply against the file it was cut from. */
export type FilePatch = {
  path: string;
  diff: string;
  /** Stable hash of the diff, checkpointed before any approval gate. */
  patchHash: string;
};

/** Terminal classification of a tuning evaluation. */
export type AlertTuningStatus =
  | 'noisy'
  | 'not_noisy'
  | 'insufficient_evidence'
  | 'anchor_not_found'
  | 'declined'
  | 'partial';

/** Persisted, reviewable proposal artifact for one evaluated alert definition. */
export type AlertTuningProposal = {
  alertId: string;
  service?: string;
  /** Fixed outcome derived from the verdict and the located anchor. */
  status: AlertTuningStatus;
  /** Inclusive analysis window actually used. */
  window: { from: string; to: string };
  score?: NoiseScore;
  anchor?: ThresholdAnchor;
  changes: ThresholdChange[];
  patch?: FilePatch;
  /** Confidence in the proposal, capped when evidence sources were missing. */
  confidence: 'high' | 'medium' | 'low';
  /** Reasons the proposal is incomplete or advisory. */
  limitations: string[];
  /** Retained evidence bundle backing every citation. */
  evidence: EvidenceRef[];
};

/** Accumulated workflow state for one tuning evaluation. */
export type AlertTuningState = {
  request: AlertTuningRequest;
  samples: FiringSample[];
  score?: NoiseScore;
  anchor?: ThresholdAnchor;
  changes: ThresholdChange[];
  patch?: FilePatch;
  limitations: string[];
  status: AlertTuningStatus;
};
