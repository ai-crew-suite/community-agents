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
/** Versioned generation input shared by the preview runner and Scaffolder action. */
export type InfraGenerationRequest = {
  version: 1;
  source: 'action' | 'manual';
  provider: 'terraform' | 'cloudformation';
  serviceName: string;
  entityRef?: string;
  environment?: string;
  capacity?: { cpu?: number; memoryMb?: number; storageGb?: number; instanceType?: string };
  region?: string;
  blueprintId?: string;
  outputDir?: string;
};

/** Config-declared approved source of an IaC blueprint. */
export type BlueprintSource = {
  id: string;
  provider: InfraGenerationRequest['provider'];
  url: string;
};

/** Deterministic routing binding for one IaC dialect. */
export type RoleBinding = {
  role: 'terraform-expert' | 'cloudformation-expert';
  dialect: 'hcl' | 'yaml';
  fileName: string;
};

/** Validation observation that blocks or explains an emitted file. */
export type Finding = {
  id: string;
  file?: string;
  severity: 'blocking' | 'advisory';
  message: string;
  source: 'syntax' | 'security' | 'policy';
};

/** Generated file held in memory until action validation succeeds. */
export type GeneratedFile = {
  path: string;
  content: string;
  dialect: string;
};

/** Evidence included in persisted preview reports. */
export type EvidenceRef = {
  id: string;
  source: 'blueprint' | 'policy' | 'architecture';
  summary: string;
  reference?: string;
};

/** Persisted report from preview generation or a Scaffolder workspace action. */
export type InfraGenerationReport = {
  serviceName: string;
  provider: InfraGenerationRequest['provider'];
  role: RoleBinding['role'];
  status:
    | 'written'
    | 'generated'
    | 'validation_failed'
    | 'policy_rejected'
    | 'blueprint_unavailable'
    | 'partial';
  blueprintId?: string;
  blueprintSource?: string;
  files: { path: string; bytes: number; dialect: string }[];
  findings: Finding[];
  corrections: number;
  limitations: string[];
  evidence: EvidenceRef[];
};
