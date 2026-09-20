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

/** Browser request for an on-demand, report-only cloud reconciliation. */
export type ShadowScanRequest = {
  version: 1;
  source: 'manual';
  provider?: string;
  service?: string;
};

/** Form values before the client adds immutable request fields. */
export type StartShadowScanInput = Omit<ShadowScanRequest, 'version' | 'source'>;

/** Inventory asset retained in a shadow report. */
export type CloudAsset = {
  id: string;
  type: string;
  provider: string;
  region?: string;
  evidence: string[];
};

/** Catalog-resolved ownership inference. */
export type OwnershipHypothesis = {
  id: string;
  groupRef: string;
  basis: 'owner_tag';
  score: number;
  evidence: string[];
};

/** Reported orphan resource with a human-click claim URL. */
export type ShadowResource = {
  asset: CloudAsset;
  fingerprint: string;
  hypotheses: OwnershipHypothesis[];
  confidence: 'high' | 'unknown';
  claimUrl: string;
  rationale: string;
};

/** Renderable report-only artifact emitted by the installed backend. */
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

/** AI Core event variants consumed by scan state. */
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
