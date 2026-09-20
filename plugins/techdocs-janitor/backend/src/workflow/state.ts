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

/** Versioned, explicitly scoped documentation audit request. */
export type JanitorRequest = {
  version: 1;
  source: 'manual';
  entityRef: string;
  repoUrl: string;
  paths: string[];
  ref?: string;
};

/** Exact source location used to make an audit finding reviewable. */
export type SourceRange = {
  path: string;
  startLine: number;
  endLine: number;
  excerpt: string;
};

/** Deterministic documentation discrepancy; no author attribution is retained. */
export type JanitorDiscrepancy = {
  id: string;
  kind: 'ownership_drift' | 'dead_relative_link' | 'unverified_external_link';
  severity: 'high' | 'medium' | 'low';
  message: string;
  range: SourceRange;
  replacement?: string;
  evidence: string[];
};

/** Replayable deterministic TechDocs audit report. */
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
