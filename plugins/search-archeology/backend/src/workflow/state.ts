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
import type { ServiceActor } from '@ai-crew-suite/plugin-kernel-node';

/** Versioned bounded research request for one legacy-system question. */
export type ArcheologyRequest = {
  version: 1;
  source: 'manual';
  question: string;
  entityRef?: string;
  repoUrl?: string;
  paths?: string[];
  since?: string;
  until?: string;
  sessionId?: string;
};

/** Citable research observation. */
export type EvidenceRef = {
  id: string;
  source: 'doc' | 'commit' | 'pr' | 'ticket' | 'org';
  summary: string;
  reference?: string;
};

/** Ticket-derived familiarity signal; no commit or reviewer signal is fabricated. */
export type ContributionEvidence = {
  id: string;
  kind: 'authored' | 'reviewed' | 'triaged' | 'commented';
  actor: ServiceActor;
  at: string;
  reference?: string;
};

/** Explicit identity outcome retained even when an actor is no longer reachable. */
export type ResolvedIdentity = {
  actor: ServiceActor;
  status: 'active' | 'moved_team' | 'offboarded' | 'unresolved';
  userRef?: string;
  displayName?: string;
  groupRefs: string[];
  evidence: string[];
};

/** Deterministically ranked familiarity record, not a performance judgment. */
export type ExpertRecord = {
  identity: ResolvedIdentity;
  score: number;
  signals: { authored: number; reviewed: number; triaged: number; recencyMonths?: number };
  rationale: string;
  evidence: string[];
};

/** Persisted expertise research artifact. */
export type ExpertiseMatrix = {
  question: string;
  scope: {
    question: string;
    entityRef?: string;
    repoUrl?: string;
    paths: string[];
    era: { since: string; until: string };
  };
  status: 'complete' | 'partial' | 'truncated' | 'inconclusive' | 'out_of_scope';
  experts: ExpertRecord[];
  offboardedContributors: ExpertRecord[];
  narrative: string;
  confidence: 'high' | 'medium' | 'low';
  limitations: string[];
  evidence: EvidenceRef[];
};
