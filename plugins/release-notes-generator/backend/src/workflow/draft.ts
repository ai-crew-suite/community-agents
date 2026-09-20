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
import type { ChangeItem, ReleaseNotesDraft, ReleaseNotesRequest } from './state';

const categories: Exclude<ChangeItem['category'], 'internal'>[] = [
  'breaking',
  'feature',
  'improvement',
  'fix',
];

const draftStatus = (
  changes: ChangeItem[],
  limitations: string[],
): ReleaseNotesDraft['status'] => {
  if (changes.length === 0) {
    return 'no_changes';
  }
  if (limitations.length > 0) {
    return 'partial';
  }
  return 'drafted';
};

/** Builds a deterministic cited draft when the model is unavailable or untrusted. */
export const buildReleaseNotesDraft = (input: {
  request: ReleaseNotesRequest;
  changes: ChangeItem[];
  filteredCount: number;
  limitations: string[];
}): ReleaseNotesDraft => {
  const { request, changes, filteredCount, limitations } = input;
  const sections = categories
    .map(category => {
      const categoryChanges = changes.filter(change => change.category === category);
      if (categoryChanges.length === 0) {
        return undefined;
      }
      return {
        category,
        text: categoryChanges.map(change => change.summary).join(' '),
        citations: categoryChanges.map(change => change.id),
      };
    })
    .filter((section): section is NonNullable<typeof section> => Boolean(section));
  const markdown = sections
    .map(section => `## ${section.category}\n${section.text}\n\n_Cites: ${section.citations.join(', ')}_`)
    .join('\n\n');
  return {
    repoUrl: request.repoUrl,
    targetVersion: request.targetVersion,
    window: { since: request.since, until: request.until },
    status: draftStatus(changes, limitations),
    sections,
    markdown,
    includedChanges: changes,
    filteredCount,
    limitations,
  };
};
