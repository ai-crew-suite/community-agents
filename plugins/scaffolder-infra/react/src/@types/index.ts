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

/** Browser wire types mirroring the non-writing Scaffolder IaC preview backend. */
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

/** Input accepted before preview client defaults `version` and `source`. */
export type PreviewGenerationInput = Omit<InfraGenerationRequest, 'version' | 'source'>;

/** Validation observation emitted for a generated preview file. */
export type Finding = {
  id: string;
  file?: string;
  severity: 'blocking' | 'advisory';
  message: string;
  source: 'syntax' | 'security' | 'policy';
};

/** Citation retained in a report artifact. */
export type EvidenceRef = {
  id: string;
  source: 'blueprint' | 'policy' | 'architecture';
  summary: string;
  reference?: string;
};

/** Persisted metadata report; file contents remain inside the Scaffolder action sandbox. */
export type InfraGenerationReport = {
  serviceName: string;
  provider: 'terraform' | 'cloudformation';
  role: 'terraform-expert' | 'cloudformation-expert';
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

/** Standard AI Core run events understood by the preview UI. */
export type AiRunEvent =
  | {
      /** Emitted when an orchestration node execution begins or completes. */
      type: 'step';
      data: { runId: string; seq: number; node: string; phase: 'enter' | 'exit' };
    }
  | {
      /** Emitted when a background diagnostic tool is invoked. */
      type: 'tool_call';
      data: { runId: string; tool: string; args: unknown };
    }
  | {
      /** Emitted when an invoked background diagnostic tool finishes execution. */
      type: 'tool_result';
      data: { runId: string; tool: string; ok: boolean; summary?: string };
    }
  | {
      /** Emitted when a structural infrastructure report is generated and saved. */
      type: 'artifact';
      data: { runId: string; kind: string; ref?: string; url?: string };
    }
  | {
      /** Terminal timeline indicator marking successful generation flow completion. */
      type: 'done';
      data: { runId: string };
    }
  | {
      /** Terminal timeline indicator marking an unrecoverable processing failure. */
      type: 'error';
      data: { runId: string; message: string };
    };
