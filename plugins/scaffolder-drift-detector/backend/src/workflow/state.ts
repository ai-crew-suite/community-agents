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

/** Versioned drift-check request selecting one catalog component. */
export type DriftCheckRequest = {
  version: 1;
  source: 'manual' | 'scheduler';
  entityRef: string;
  repoUrl?: string;
  infraPaths?: string[];
  /** Future remediation request; no write occurs without a registered VCS tool. */
  remediate?: boolean;
  /**
   * Bounded expectation supplied by an on-demand caller until the shared
   * Scaffolder blueprint reader is available. It is data, not executable template
   * content, and is rejected when absent rather than inferred.
   */
  blueprint?: BlueprintSpec;
};

/** Bounded golden-path fields that can be reconciled against a workload snapshot. */
export type BlueprintSpec = {
  replicas?: number;
  image?: string;
  /** Resource limits represented as stable string values, e.g. `512Mi`. */
  limits?: { cpu?: string; memory?: string };
};

/** Citable observation retained in drift artifacts. */
export type EvidenceRef = {
  id: string;
  source: 'blueprint' | 'live' | 'cost' | 'knowledge' | 'iac';
  summary: string;
  reference?: string;
};

/** Normalized live Kubernetes state used by deterministic comparison. */
export type InfraSnapshot = {
  replicas?: number;
  image?: string;
  limits?: { cpu?: string; memory?: string };
  readyPods?: number;
  expectedPods?: number;
};

/** One structural divergence with evidence for both compared values. */
export type DriftItem = {
  id: string;
  field:
    | 'spec.replicas'
    | 'container.image'
    | 'resources.limits.cpu'
    | 'resources.limits.memory'
    | 'pods.ready';
  expected: { value: string | number | undefined; evidence: string[] };
  actual: { value: string | number | undefined; evidence: string[] };
  severity: 'critical' | 'major' | 'minor' | 'info';
};

/** A validated source patch, reserved for the future remediation write milestone. */
export type FilePatch = { path: string; diff: string; patchHash: string };

/** Persisted result of a deterministic drift evaluation. */
export type DriftReport = {
  entityRef: string;
  status: 'in_sync' | 'drifted' | 'partial' | 'insufficient_evidence';
  items: DriftItem[];
  limitations: string[];
  evidence: EvidenceRef[];
};
