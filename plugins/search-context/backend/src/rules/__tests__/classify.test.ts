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
import { classifyConsumer } from '../classify';

const node = {
  ref: 'component:default/consumer',
  owner: 'group:default/team',
  hop: 1,
  viaRelation: 'dependencyOf',
  relationId: 'dep-1',
};

const change = { kind: 'endpoint_removed' as const, symbol: '/v1/charge' };

describe('classifyConsumer', () => {
  it('requires capable empty search before reporting unaffected', () => {
    expect(
      classifyConsumer({
        node,
        repoUrl: 'https://github.com/acme/consumer',
        capable: true,
        matches: [],
        change,
      }).classification,
    ).toBe('unaffected');

    expect(
      classifyConsumer({
        node,
        repoUrl: 'https://bitbucket.org/acme/consumer',
        capable: false,
        matches: [],
        change,
      }),
    ).toMatchObject({
      classification: 'unknown',
      reason: 'search_unsupported',
    });
  });

  it('reports a positive textual match as impacted and missing repository as unknown', () => {
    expect(
      classifyConsumer({
        node,
        repoUrl: 'https://github.com/acme/consumer',
        capable: true,
        matches: [
          {
            id: 'match-1',
            repoUrl: 'https://github.com/acme/consumer',
            path: 'client.ts',
            query: '/v1/charge',
          },
        ],
        change,
      }),
    ).toMatchObject({ classification: 'impacted', severity: 'critical' });

    expect(
      classifyConsumer({ node, capable: false, matches: [], change }),
    ).toMatchObject({ classification: 'unknown', reason: 'no_repository' });
  });
});
