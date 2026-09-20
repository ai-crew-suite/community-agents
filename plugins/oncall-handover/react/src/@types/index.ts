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

/** Versioned browser request for one bounded handover brief. */
export type HandoverRequest = {
  version: 1;
  source: 'manual' | 'scheduler';
  windowHours?: number;
  endsAt?: string;
  team?: string;
  entityRefs?: string[];
  incomingEngineer?: string;
};

/** One retained, cited operational signal. */
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

/** Structured handover artifact emitted by the backend workflow. */
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

/** AI Core events consumed by the handover SSE client. */
export type AiRunEvent =
  | { type: 'step'; data: { runId: string; seq: number; node: string; phase: 'enter' | 'exit' } }
  | { type: 'tool_call'; data: { runId: string; tool: string; args: unknown } }
  | { type: 'tool_result'; data: { runId: string; tool: string; ok: boolean; summary?: string } }
  | { type: 'artifact'; data: { runId: string; kind: string; ref?: string } }
  | { type: 'done'; data: { runId: string } }
  | { type: 'error'; data: { runId: string; message: string } };
