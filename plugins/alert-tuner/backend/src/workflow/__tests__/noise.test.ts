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
import { scoreNoise, type NoiseThresholds } from '../noise';
import { applySuppression, overlaps } from '../correlate';
import type { FiringSample } from '../state';

const thresholds: NoiseThresholds = {
  minSamples: 8,
  autoResolveRatio: 0.8,
  selfClearSeconds: 300,
  maxPagedRatio: 0.2,
};

/** Builds a run of identical auto-resolved firings one hour apart. */
const autoFirings = (count: number, durationSeconds: number): FiringSample[] =>
  Array.from({ length: count }, (_unused, index) => {
    const triggeredAt = new Date(Date.UTC(2026, 0, 1, index)).toISOString();
    return {
      id: `fire-${index + 1}`,
      triggeredAt,
      resolvedAt: new Date(Date.parse(triggeredAt) + durationSeconds * 1000).toISOString(),
      durationSeconds,
      resolution: 'auto' as const,
      paged: false,
    };
  });

describe('scoreNoise', () => {
  /**
   * The foundation scenario: an alert firing repeatedly and clearing itself in
   * about ninety seconds without paging anybody is the false-positive
   * fingerprint the tuner exists to find.
   */
  it('classifies frequent short self-clearing firings as noisy', () => {
    const score = scoreNoise(autoFirings(15, 90), thresholds);

    expect(score).toMatchObject({
      samples: 15,
      autoResolveRatio: 1,
      medianSelfClearSeconds: 90,
      pagedRatio: 0,
      verdict: 'noisy',
    });
  });

  /**
   * Percentiles rather than means must drive the verdict, so one long outage
   * appended to a noisy history cannot rescue the alert from a noisy verdict.
   */
  it('keeps the median stable when a single long outage is appended', () => {
    const withOutage = [
      ...autoFirings(15, 90),
      {
        id: 'fire-16',
        triggeredAt: '2026-01-02T00:00:00.000Z',
        resolvedAt: '2026-01-02T04:00:00.000Z',
        durationSeconds: 14_400,
        resolution: 'auto' as const,
        paged: false,
      },
    ];

    const score = scoreNoise(withOutage, thresholds);

    // Both percentiles resist the outlier, which is exactly why a mean would be
    // the wrong statistic here: it would land near 990s and hide the noise.
    expect(score.medianSelfClearSeconds).toBe(90);
    expect(score.p90SelfClearSeconds).toBe(90);
    expect(score.verdict).toBe('noisy');
  });

  /**
   * An alert that consistently pages a responder is human-actioned by
   * definition, which must brake the noisy verdict outright.
   */
  it('treats a high paged share as inconclusive despite auto-resolution', () => {
    const paging = autoFirings(15, 90).map((sample) => ({ ...sample, paged: true }));

    expect(scoreNoise(paging, thresholds).verdict).toBe('inconclusive');
  });

  /** Too few firings must never yield a verdict that could justify a patch. */
  it('refuses to score below the minimum sample size', () => {
    expect(scoreNoise(autoFirings(3, 90), thresholds).verdict).toBe('inconclusive');
  });

  /**
   * Unresolved firings are counted for volume but must not be mistaken for
   * evidence that the alert clears itself.
   */
  it('excludes unresolved firings from duration and auto-resolve statistics', () => {
    const mixed: FiringSample[] = [
      ...autoFirings(8, 120),
      {
        id: 'fire-9',
        triggeredAt: '2026-01-03T00:00:00.000Z',
        resolution: 'unresolved',
        paged: false,
      },
    ];

    const score = scoreNoise(mixed, thresholds);

    expect(score.samples).toBe(9);
    expect(score.autoResolveRatio).toBe(1);
    expect(score.medianSelfClearSeconds).toBe(120);
  });
});

describe('real-signal suppression', () => {
  /**
   * The tuner must never tune away a genuine failure: an overlapping incident
   * flips even a strongly noisy fingerprint to a real signal.
   */
  it('suppresses a noisy verdict when a firing overlaps a real incident', () => {
    const samples = autoFirings(15, 90);
    const score = scoreNoise(samples, thresholds);

    const suppressed = applySuppression(
      score,
      samples,
      [{ id: 'inc-1', start: '2026-01-01T05:00:00.000Z', end: '2026-01-01T06:00:00.000Z' }],
      15
    );

    expect(suppressed.verdict).toBe('real_signal');
    expect(suppressed.suppressedBy).toEqual(['inc-1']);
  });

  /** A non-overlapping incident must leave the statistical verdict untouched. */
  it('leaves the verdict intact when no incident overlaps', () => {
    const samples = autoFirings(15, 90);
    const score = scoreNoise(samples, thresholds);

    const unaffected = applySuppression(
      score,
      samples,
      [{ id: 'inc-1', start: '2026-03-01T00:00:00.000Z', end: '2026-03-01T01:00:00.000Z' }],
      15
    );

    expect(unaffected.verdict).toBe('noisy');
    expect(unaffected.suppressedBy).toBeUndefined();
  });

  /** The configured pad must correlate a firing that just precedes an incident. */
  it('applies the correlation pad around the incident window', () => {
    const sample = autoFirings(1, 90)[0];
    const window = { id: 'inc-1', start: '2026-01-01T00:10:00.000Z' };

    expect(overlaps(sample, window, 15)).toBe(true);
    expect(overlaps(sample, window, 1)).toBe(false);
  });
});
