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
export type PostmortemRequest = {
  version: 1;
  source: 'manual';
  incidentId: string;
};

export type TimelineEvent = {
  id: string;
  source: 'incident' | 'alert';
  at: string;
  summary: string;
  reference?: string;
};

export type PostmortemDraft = {
  incidentId: string;
  title: string;
  status: 'draft_only' | 'partial' | 'incident_open' | 'incident_unavailable';
  window?: { since: string; until: string };
  timeline: TimelineEvent[];
  narrative: string;
  coverage: {
    incident: 'collected' | 'unavailable';
    alerts: 'collected' | 'unavailable' | 'empty';
    chat: 'unavailable';
    observability: 'unavailable';
    vcs: 'unavailable';
  };
  limitations: string[];
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
