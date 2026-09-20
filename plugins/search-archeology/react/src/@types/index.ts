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
/** Browser wire types for the ticket-triage archeology artifact. */
export type ArcheologyRequest = {
  version: 1;
  source: 'manual';
  question: string;
  entityRef?: string;
  repoUrl?: string;
  paths?: string[];
  since?: string;
  until?: string;
};

/** Form values accepted before the browser client supplies version and source. */
export type StartArcheologyInput = Omit<
  ArcheologyRequest,
  'version' | 'source'
>;

/** Citable observation supplied by the backend. */
export type EvidenceRef = {
  id: string;
  source: 'doc' | 'commit' | 'pr' | 'ticket' | 'org';
  summary: string;
  reference?: string;
};

/** Provider actor retained when catalog resolution is unavailable. */
export type ResolvedIdentity = {
  actor: { id: string; displayName?: string; email?: string };
  status: 'active' | 'moved_team' | 'offboarded' | 'unresolved';
  userRef?: string;
  displayName?: string;
  groupRefs: string[];
  evidence: string[];
};

/** Familiarity record whose score is not a performance measure. */
export type ExpertRecord = {
  identity: ResolvedIdentity;
  score: number;
  signals: {
    authored: number;
    reviewed: number;
    triaged: number;
    recencyMonths?: number;
  };
  rationale: string;
  evidence: string[];
};

/** Renderable expertise-matrix artifact emitted by the deployed backend. */
export type ExpertiseMatrix = {
  question: string;
  scope: {
    question: string;
    entityRef?: string;
    repoUrl?: string;
    paths: string[];
    era: { since: string; until: string };
  };
  status:
    'complete' | 'partial' | 'truncated' | 'inconclusive' | 'out_of_scope';
  experts: ExpertRecord[];
  offboardedContributors: ExpertRecord[];
  narrative: string;
  confidence: 'high' | 'medium' | 'low';
  limitations: string[];
  evidence: EvidenceRef[];
};

/** AI Core event variants consumed by the archeology run state. */
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
