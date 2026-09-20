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

/** Versioned manual request for one bounded repository scan. */
export type DebtScoutRequest = {
  version: 1;
  source: 'manual';
  repoUrl: string;
  entityRef?: string;
  question?: string;
};

/** Cited, redacted observation used to justify a debt finding. */
export type EvidenceRef = {
  id: string;
  source: 'code' | 'manifest' | 'scorecard' | 'ticket' | 'knowledge';
  summary: string;
  reference?: string;
};

/** Raw marker or secret-pattern signal; secret values are never retained. */
export type DebtSignal = {
  id: string;
  kind: 'marker' | 'stale_dependency' | 'secret_literal';
  repoUrl: string;
  path: string;
  line?: number;
  raw: string;
  markerTag?: 'TODO' | 'FIXME' | 'HACK' | 'XXX';
  markerScope?: string;
  evidence: string[];
};

/** Deterministically scored code-debt record. */
export type DebtFinding = {
  signal: DebtSignal;
  fingerprint: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  score: number;
  reasons: string[];
  disposition: 'escalate' | 'suppressed' | 'already_tracked';
  owner?: string;
  summary: string;
  corroboration: string[];
};

/** Per-repository result that separates unsupported scans from clean scans. */
export type RepoScanOutcome = {
  repoUrl: string;
  entityRef?: string;
  status: 'scanned' | 'search_unsupported' | 'scan_failed' | 'skipped';
  signalCount: number;
  reason?: string;
};

/** Replayable report artifact for a single read-only technical-debt scan. */
export type DebtReport = {
  scannedAt: string;
  targets: RepoScanOutcome[];
  findings: DebtFinding[];
  counts: { escalate: number; suppressed: number; alreadyTracked: number };
  bySeverity: Record<DebtFinding['severity'], number>;
  byOwner: { owner: string; escalateCount: number; highestSeverity: string }[];
  status:
    'report_only' | 'no_findings' | 'no_targets' | 'truncated' | 'partial';
  limitations: string[];
  evidence: EvidenceRef[];
};
