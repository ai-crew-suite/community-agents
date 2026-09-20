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
import { toFiringEvidence, toFiringSamples } from '../history';

const WINDOW = { from: '2026-01-01T00:00:00.000Z', to: '2026-01-31T00:00:00.000Z' };

describe('toFiringSamples Production Ingestion Suite', () => {
  /** Happy Path Validation */
  it('derives durations and assigns stable citation identifiers', () => {
    const samples = toFiringSamples(
      [
        {
          id: 'a',
          title: 'CPU high',
          triggeredAt: '2026-01-10T00:00:00.000Z',
          resolvedAt: '2026-01-10T00:01:30.000Z',
          resolution: 'auto',
          paged: false,
        },
      ],
      WINDOW,
      500
    );

    expect(samples).toEqual([
      {
        id: 'fire-1',
        triggeredAt: '2026-01-10T00:00:00.000Z',
        resolvedAt: '2026-01-10T00:01:30.000Z',
        durationSeconds: 90,
        resolution: 'auto',
        paged: false,
      },
    ]);
  });

  /** Window Boundaries */
  it('drops entries outside the window and those with no trigger time', () => {
    const samples = toFiringSamples(
      [
        { id: 'a', title: 'old', triggeredAt: '2025-01-01T00:00:00.000Z' },
        { id: 'b', title: 'untimed' },
        { id: 'c', title: 'kept', triggeredAt: '2026-01-15T00:00:00.000Z' },
      ],
      WINDOW,
      500
    );

    expect(samples.map((sample) => sample.triggeredAt)).toEqual(['2026-01-15T00:00:00.000Z']);
  });

  /** Duration Edge Cases */
  it('records unresolved firings without a duration', () => {
    const [sample] = toFiringSamples(
      [{ id: 'a', title: 'stuck', triggeredAt: '2026-01-10T00:00:00.000Z' }],
      WINDOW,
      500
    );

    expect(sample).toMatchObject({ resolution: 'unresolved', durationSeconds: undefined });
  });

  /** Truncation Mechanics */
  it('caps retained samples newest-first', () => {
    const entries = Array.from({ length: 5 }, (_unused, index) => ({
      id: `a-${index}`,
      title: 'CPU high',
      triggeredAt: new Date(Date.UTC(2026, 0, 10 + index)).toISOString(),
    }));

    const samples = toFiringSamples(entries, WINDOW, 2);

    expect(samples.map((sample) => sample.triggeredAt)).toEqual([
      '2026-01-14T00:00:00.000Z',
      '2026-01-13T00:00:00.000Z',
    ]);
  });

  it('drops resolved timestamps that precede their trigger time as unusable data', () => {
    const samples = toFiringSamples(
      [
        {
          id: 'time-inverted',
          title: 'Clock Sync Bug',
          triggeredAt: '2026-01-15T12:00:00.000Z',
          resolvedAt: '2026-01-15T11:59:00.000Z', // Resolved 1 min BEFORE it triggered
          resolution: 'auto',
        },
      ],
      WINDOW,
      10
    );

    expect(samples).toHaveLength(1);
    expect(samples[0]).toMatchObject({
      id: 'fire-1',
      resolvedAt: undefined,       // Verified wiped safely
      durationSeconds: undefined,  // Verified wiped safely
      resolution: 'auto',          // FIX: Matches entry.resolution prioritization rule
    });
  });

  it('safely handles negative sample bounds caps by treating them as 0 space limits', () => {
    const samples = toFiringSamples(
      [{ id: 'a', title: 'alert', triggeredAt: '2026-01-15T00:00:00.000Z' }],
      WINDOW,
      -25 // Negative configuration injection bounds
    );

    expect(samples).toHaveLength(0);
  });

  it('defaults to safe wide-open bounds thresholds if window values are corrupt or unparseable', () => {
    const entries = [
      { id: '1', title: 'a', triggeredAt: '1970-01-02T00:00:00.000Z' },
      { id: '2', title: 'b', triggeredAt: '2026-01-15T00:00:00.000Z' },
    ];

    const samples = toFiringSamples(
      entries,
      { from: 'corrupt-date-string', to: 'corrupt-date-string' },
      10
    );

    // from defaults to 0, to defaults to MAX_SAFE_INTEGER, meaning both pass window validation checks cleanly
    expect(samples).toHaveLength(2);
  });
});

describe('toFiringEvidence Evidence Serialization Verification', () => {
  it('summarizes evidence without alert payload detail or context leakage', () => {
    const samples = toFiringSamples(
      [
        {
          id: 'a',
          title: 'CPU high on prod-db-01',
          triggeredAt: '2026-01-10T00:00:00.000Z',
          resolvedAt: '2026-01-10T00:01:30.000Z',
          resolution: 'auto',
        },
      ],
      WINDOW,
      500
    );

    const [evidence] = toFiringEvidence(samples);

    expect(evidence.id).toBe('fire-1');
    expect(evidence.summary).toContain('cleared after 90s');
    expect(evidence.summary).not.toContain('prod-db-01');
  });
});
