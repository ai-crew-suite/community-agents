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
import { resolveWindow } from '../window';
import { parseHandoverQuery, HandoverRequestValidationError } from '../request';
import { clusterSignals } from '../clustering';
import { buildHandoverBrief } from '../brief';

describe('handover pure workflow helpers', () => {
  it('clamps the trailing window', () => {
    const result = resolveWindow(
      { version: 1, source: 'manual', team: 'sre', windowHours: 72 },
      { defaultHours: 12, maxHours: 48, now: () => new Date('2026-01-01T12:00:00Z') }
    );

    expect(result).toMatchObject({
      hours: 48,
      clamped: true,
      start: '2025-12-30T12:00:00.000Z',
    });
  });

  it('rejects unscoped requests', () => {
    expect(() => parseHandoverQuery('{"version":1}', 'manual')).toThrow(
      HandoverRequestValidationError
    );
  });

  it('clusters noisy repeated alerts deterministically', () => {
    const signals = Array.from({ length: 50 }, (_, index) => ({
      id: `sig-${index}`,
      source: 'incident' as const,
      kind: 'alert',
      service: index < 40 ? 'catalog' : 'payments',
      summary: index < 40 ? 'High Error Rate' : 'Queue Backlog',
      observedAt: `2026-01-01T0${index % 9}:00:00Z`,
      status: 'active' as const,
    }));

    const clusters = clusterSignals(signals, 25);

    expect(clusters).toHaveLength(2);
    expect(clusters[0]).toMatchObject({
      title: 'High Error Rate',
      count: 40,
      status: 'active',
    });
    expect(clusters[1]?.count).toBe(10);
  });

  it('builds a no-activity brief without unsupported claims', () => {
    const brief = buildHandoverBrief({
      request: { version: 1, source: 'manual', team: 'sre' },
      window: { start: 'a', end: 'b' },
      signals: [],
      clusters: [],
      limitations: [],
    });

    expect(brief.status).toBe('no_activity');
    expect(brief.highlights).toEqual([]);
  });
});
