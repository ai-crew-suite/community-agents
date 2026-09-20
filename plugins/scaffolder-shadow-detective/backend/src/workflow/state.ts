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

/** Versioned request for an on-demand provider inventory scan. */
export type ShadowScanRequest = { version: 1; source: 'manual'; provider?: string; service?: string };

/** Normalized cloud asset retained in a report-only reconciliation. */
export type CloudAsset = {
  id: string;
  type: string;
  provider: string;
  region?: string;
  tags?: Record<string, string>;
  owner?: string;
  catalogEntityRef?: string;
  evidence: string[];
};

/** Deterministic, catalog-resolved ownership hypothesis. */
export type OwnershipHypothesis = {
  id: string;
  groupRef: string;
  basis: 'owner_tag';
  score: number;
  evidence: string[];
};

/** One unbound asset with a human-clicked claim path. */
export type ShadowResource = {
  asset: CloudAsset;
  fingerprint: string;
  hypotheses: OwnershipHypothesis[];
  confidence: 'high' | 'unknown';
  claimUrl: string;
  rationale: string;
};

/** Replayable report emitted by the report-only reconciliation milestone. */
export type ShadowResourceReport = {
  providers: string[];
  scanned: number;
  registered: number;
  orphans: ShadowResource[];
  suppressedCount: number;
  status: 'report_only' | 'no_orphans' | 'truncated' | 'partial';
  limitations: string[];
  evidence: {
    id: string;
    source: 'cloud' | 'catalog' | 'tag';
    summary: string;
    reference?: string;
  }[];
};
