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

/** Browser wire contract for one manually initiated source-change assessment. */
export type ImpactRequest = {
  version: 1;
  source: 'manual';
  entityRef: string;
  change: {
    kind:
      | 'endpoint_removed'
      | 'endpoint_deprecated'
      | 'field_renamed'
      | 'field_removed'
      | 'signature_changed';
    symbol: string;
    replacement?: string;
    aliases?: string[];
  };
  maxDepth?: number;
  relationTypes?: string[];
};

/** Form values before the client adds immutable request version and source fields. */
export type StartImpactInput = Omit<ImpactRequest, 'version' | 'source'>;

/** Redacted code-search evidence for one textual reference. */
export type CodeMatch = {
  id: string;
  repoUrl: string;
  path: string;
  line?: number;
  snippet?: string;
  ref?: string;
  query: string;
};

/** Verification outcome for one catalog consumer candidate. */
export type ConsumerImpact = {
  entityRef: string;
  owner: string;
  hop: number;
  relationId: string;
  repoUrl?: string;
  classification: 'impacted' | 'unaffected' | 'unknown';
  reason?: 'no_repository' | 'search_unsupported' | 'search_failed';
  severity?: 'critical' | 'high' | 'medium' | 'low';
  matches: CodeMatch[];
};

/** Impacted-only owner routing summary. */
export type OwnerRollup = {
  owner: string;
  impactedCount: number;
  highestSeverity: 'critical' | 'high' | 'medium' | 'low';
  consumers: string[];
};

/** Renderable artifact emitted by the installed search-context backend. */
export type ImpactAssessment = {
  entityRef: string;
  change: ImpactRequest['change'];
  status: 'complete' | 'partial' | 'no_consumers' | 'out_of_scope';
  graphTruncated: boolean;
  consumers: ConsumerImpact[];
  counts: { impacted: number; unaffected: number; unknown: number };
  ownerRollups: OwnerRollup[];
  limitations: string[];
};

/** AI Core server-sent event variants consumed by the run reducer. */
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
