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

/** Versioned request for one repository's release-notes draft. */
export type ReleaseNotesRequest = {
  version: 1;
  source: 'manual' | 'scheduler';
  repoUrl: string;
  targetVersion: string;
  since?: string;
  until?: string;
};

/** Deterministically categorized, citation-eligible pull-request change. */
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

/** Structured, citation-required artifact produced before any approval gate. */
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

/** Future publication artifact shape, intentionally not emitted without the VCS write contract. */
export type ReleaseNotesPublication = {
  repoUrl: string;
  targetVersion: string;
  url?: string;
  draftRef: string;
};
