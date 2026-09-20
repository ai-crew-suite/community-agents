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

/** Versioned manual request for one source entity and concrete change signature. */
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

/** A cited catalog edge connecting the source entity to a candidate consumer. */
export type DependencyNode = {
  ref: string;
  owner?: string;
  hop: number;
  viaRelation: string;
  relationId: string;
};

/** Redacted code-search evidence; it proves a textual reference only. */
export type CodeMatch = {
  id: string;
  repoUrl: string;
  path: string;
  line?: number;
  snippet?: string;
  ref?: string;
  query: string;
};

/** Deterministic per-consumer verification result. */
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

/** Impacted-only work routing summary grouped by catalog owner. */
export type OwnerRollup = {
  owner: string;
  impactedCount: number;
  highestSeverity: 'critical' | 'high' | 'medium' | 'low';
  consumers: string[];
};

/** Replayable artifact emitted by a bounded impact assessment run. */
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
