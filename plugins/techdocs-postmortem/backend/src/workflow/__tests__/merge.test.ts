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
import { mergeTimeline } from '../merge';

describe('mergeTimeline', () => {
  it('orders events chronologically with deterministic tie-breaking', () => {
    const result = mergeTimeline([
      {
        id: 'b',
        source: 'incident',
        at: '2026-01-01T01:00:00.000Z',
        summary: 'incident',
      },
      {
        id: 'a',
        source: 'alert',
        at: '2026-01-01T01:00:00.000Z',
        summary: 'alert',
      },
      {
        id: 'c',
        source: 'alert',
        at: '2026-01-01T00:00:00.000Z',
        summary: 'earlier',
      },
    ]);

    expect(result.map(event => event.id)).toEqual(['c', 'a', 'b']);
  });
});
