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
import { computeDrift } from '../delta';

describe('computeDrift', () => {
  it('isolates replicas and memory divergence with paired citations', () => {
    const items = computeDrift(
      { replicas: 2, image: 'app:v1', limits: { memory: '512Mi' } },
      { replicas: 6, image: 'app:v1', limits: { memory: '1Gi' } }
    );

    expect(items).toMatchObject([
      {
        field: 'spec.replicas',
        expected: { value: 2, evidence: ['bp-1'] },
        actual: { value: 6, evidence: ['live-1'] },
        severity: 'major'
      },
      {
        field: 'resources.limits.memory',
        expected: { value: '512Mi' },
        actual: { value: '1Gi' }
      },
    ]);
  });

  it('returns no items when expected and live state match', () => {
    expect(
      computeDrift(
        { replicas: 2, image: 'app:v1' },
        { replicas: 2, image: 'app:v1' }
      )
    ).toEqual([]);
  });
});
