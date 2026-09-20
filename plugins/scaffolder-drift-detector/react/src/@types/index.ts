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
export type BlueprintSpec = {
  replicas?: number;
  image?: string;
  limits?: { cpu?: string; memory?: string };
};

export type DriftCheckRequest = {
  version: 1;
  source: 'manual' | 'scheduler';
  entityRef: string;
  repoUrl?: string;
  infraPaths?: string[];
  remediate?: boolean;
  blueprint?: BlueprintSpec;
};

export type CheckDriftInput = Omit<DriftCheckRequest, 'version' | 'source'>;

export type EvidenceRef = {
  id: string;
  source: 'blueprint' | 'live' | 'cost' | 'knowledge' | 'iac';
  summary: string;
  reference?: string;
};

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

export type DriftReport = {
  entityRef: string;
  status: 'in_sync' | 'drifted' | 'partial' | 'insufficient_evidence';
  items: DriftItem[];
  limitations: string[];
  evidence: EvidenceRef[];
};

export type ApprovalDecision = {
  status: 'approved' | 'rejected';
  note?: string;
};

export type AiRunEvent =
  | {
      type: 'step';
      data: { runId: string; seq: number; node: string; phase: 'enter' | 'exit' };
    }
  | {
      type: 'tool_call';
      data: { runId: string; tool: string; args: unknown };
    }
  | {
      type: 'tool_result';
      data: { runId: string; tool: string; ok: boolean; summary?: string };
    }
  | {
      type: 'approval_request';
      data: { runId: string; approvalId: string; reason: string; effect: 'read' | 'write' };
    }
  | {
      type: 'artifact';
      data: { runId: string; kind: string; ref?: string; url?: string };
    }
  | {
      type: 'done';
      data: { runId: string };
    }
  | {
      type: 'error';
      data: { runId: string; message: string };
    };
