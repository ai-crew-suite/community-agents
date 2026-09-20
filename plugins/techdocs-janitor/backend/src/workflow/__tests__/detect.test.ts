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
import { detectMarkdown } from '../detect';

describe('deterministic markdown detection', () => {
  it('finds owner drift, relative links, and unverified external links with exact ranges', () => {
    const findings = detectMarkdown({
      path: 'docs/index.md',
      owner: 'group:default/team-beta',
      content:
        'owner: group:default/team-alpha\n[Legacy](../legacy/index.md)\n[Website](https://example.test)',
    });

    expect(findings.map(finding => finding.kind)).toEqual([
      'ownership_drift',
      'dead_relative_link',
      'unverified_external_link',
    ]);

    expect(findings[0]).toMatchObject({
      severity: 'high',
      replacement: 'group:default/team-beta',
      range: { startLine: 1 },
    });
  });
});
