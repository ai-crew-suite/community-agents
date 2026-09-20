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
/** Browser request for one manual, read-only repository scan. */
export type DebtScoutRequest = {
  version: 1;
  source: 'manual';
  repoUrl: string;
  entityRef?: string;
  question?: string;
};

/** Form input before the client supplies request version and source. */
export type StartDebtScanInput = Omit<DebtScoutRequest, 'version' | 'source'>;

/** Cited report observation. */
export type EvidenceRef = {
  id: string;
  source: 'code' | 'manifest' | 'scorecard' | 'ticket' | 'knowledge';
  summary: string;
  reference?: string;
};

/** Redacted source marker or secret-pattern observation. */
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

/** Deterministically scored code-debt finding. */
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

/** Per-repository scan outcome that distinguishes unavailable search from a clean scan. */
export type RepoScanOutcome = {
  repoUrl: string;
  entityRef?: string;
  status: 'scanned' | 'search_unsupported' | 'scan_failed' | 'skipped';
  signalCount: number;
  reason?: string;
};

/** Renderable report artifact emitted by the deployed read-only scout. */
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

/** AI Core event variants used by the report page. */
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
  | { type: 'artifact'; data: { runId: string; kind: string; ref?: string } }
  | { type: 'done'; data: { runId: string } }
  | { type: 'error'; data: { runId: string; message: string } };
