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
export type JanitorRequest = {
  version: 1;
  source: 'manual';
  entityRef: string;
  repoUrl: string;
  paths: string[];
  ref?: string;
};

export type StartJanitorInput = Omit<JanitorRequest, 'version' | 'source'>;

export type JanitorDiscrepancy = {
  id: string;
  kind: 'ownership_drift' | 'dead_relative_link' | 'unverified_external_link';
  severity: 'high' | 'medium' | 'low';
  message: string;
  range: { path: string; startLine: number; endLine: number; excerpt: string };
  replacement?: string;
  evidence: string[];
};

export type JanitorReport = {
  entityRef: string;
  repoUrl: string;
  ref?: string;
  status: 'clean' | 'findings' | 'partial' | 'no_docs';
  discrepancies: JanitorDiscrepancy[];
  limitations: string[];
  evidence: {
    id: string;
    source: 'catalog' | 'markdown';
    summary: string;
    reference?: string;
  }[];
};
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
