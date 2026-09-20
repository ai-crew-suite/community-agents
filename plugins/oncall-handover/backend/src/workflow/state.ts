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
/** Versioned input for one bounded shift handover. */
export type HandoverRequest = {
  version: 1;
  source: 'manual' | 'scheduler';
  windowHours?: number;
  endsAt?: string;
  team?: string;
  entityRefs?: string[];
  incomingEngineer?: string;
};

/** Redacted operational observation eligible for citations. */
export type RawSignal = {
  id: string;
  source: 'incident' | 'kubernetes' | 'vcs' | 'project' | 'knowledge';
  kind: string;
  observedAt?: string;
  service?: string;
  summary: string;
  reference?: string;
  status?: 'active' | 'resolved' | 'unknown';
};

/** Deterministic cluster of repeated incident signals. */
export type IncidentCluster = {
  id: string;
  service?: string;
  title: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
  status: 'active' | 'resolved' | 'unknown';
  signals: string[];
  correlated: string[];
};

/** Persisted, citation-required shift handover artifact. */
export type HandoverBrief = {
  window: { start: string; end: string };
  team?: string;
  incomingEngineer?: string;
  currentOncall?: string;
  status: 'compiled' | 'partial' | 'no_activity';
  highlights: { text: string; severity: 'high' | 'medium' | 'low'; citations: string[] }[];
  activeIncidents: IncidentCluster[];
  openTickets: { key: string; summary: string; status: string; citation: string }[];
  notableChanges: { summary: string; citation: string }[];
  recommendedWatchItems: string[];
  limitations: string[];
  signals: RawSignal[];
};

/** Mutable graph state accumulated during collection and enrichment. */
export type HandoverState = {
  request: HandoverRequest;
  window: { start: string; end: string };
  signals: RawSignal[];
  clusters: IncidentCluster[];
  limitations: string[];
  currentOncall?: string;
};
