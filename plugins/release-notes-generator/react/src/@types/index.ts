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

/** Versioned browser request for one repository release-notes draft. */
export type ReleaseNotesRequest = {
  version: 1;
  source: 'manual' | 'scheduler';
  repoUrl: string;
  targetVersion: string;
  since?: string;
  until?: string;
};

/** Deterministically categorized change included in or filtered from a draft. */
export type ChangeItem = {
  id: string;
  category: 'feature' | 'fix' | 'improvement' | 'breaking' | 'internal';
  title: string;
  summary: string;
  pullRequest: string;
  url?: string;
  mergedAt?: string;
  ticketKey?: string;
};

/** Cited release-notes draft emitted by the current backend workflow. */
export type ReleaseNotesDraft = {
  repoUrl: string;
  targetVersion: string;
  window: { since?: string; until?: string };
  status: 'drafted' | 'partial' | 'no_changes';
  sections: { category: Exclude<ChangeItem['category'], 'internal'>; text: string; citations: string[] }[];
  markdown: string;
  includedChanges: ChangeItem[];
  filteredCount: number;
  limitations: string[];
};

/** Future publication artifact emitted after an approved write-capable run. */
export type ReleaseNotesPublication = { repoUrl: string; targetVersion: string; url?: string; draftRef: string };

/** Human decision submitted to AI Core for a pending publish approval. */
export type ApprovalDecision = { status: 'approved' | 'rejected'; note?: string; decidedBy?: string };

/** Shared AI Core SSE events used by the release-notes UI. */
export type AiRunEvent =
  | { type: 'step'; data: { runId: string; seq: number; node: string; phase: 'enter' | 'exit' } }
  | { type: 'tool_call'; data: { runId: string; tool: string; args: unknown } }
  | { type: 'tool_result'; data: { runId: string; tool: string; ok: boolean; summary?: string } }
  | { type: 'approval_request'; data: { runId: string; approvalId: string; reason: string; effect: 'read' | 'write' } }
  | { type: 'artifact'; data: { runId: string; kind: string; ref?: string; url?: string } }
  | { type: 'done'; data: { runId: string } }
  | { type: 'error'; data: { runId: string; message: string } };
