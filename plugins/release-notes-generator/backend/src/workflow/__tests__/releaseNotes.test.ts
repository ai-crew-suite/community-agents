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
import { describe, expect, it } from 'vitest';
import { categorizeTitle, filterCustomerChanges } from '../categorize';
import { buildReleaseNotesDraft } from '../draft';

describe('release-notes deterministic helpers', () => {
  const taxonomy = { feature: ['feat'], fix: ['fix'], improvement: ['improve'], breaking: ['breaking'], internal: ['chore'] };
  it('categorizes conventional titles and filters internal chores', () => {
    expect(categorizeTitle('feat: add exports', taxonomy)).toBe('feature');
    expect(categorizeTitle('BREAKING change API', taxonomy)).toBe('breaking');
    const result = filterCustomerChanges([{ id: 'chg-1', category: 'feature', title: 'feat', summary: 'feat', pullRequest: '1' }, { id: 'chg-2', category: 'internal', title: 'chore', summary: 'chore', pullRequest: '2' }]);
    expect(result).toMatchObject({ filteredCount: 1 });
    expect(result.included).toHaveLength(1);
  });
  it('builds a no-changes draft without unsupported copy', () => {
    expect(buildReleaseNotesDraft({ request: { version: 1, source: 'manual', repoUrl: 'https://github.com/acme/app', targetVersion: 'v1.0.0' }, changes: [], filteredCount: 0, limitations: [] }).status).toBe('no_changes');
  });
});
