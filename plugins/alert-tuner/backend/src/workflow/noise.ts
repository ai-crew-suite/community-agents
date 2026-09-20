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
import type { FiringSample, NoiseScore } from './state';

/** Deterministic thresholds that turn firing statistics into a fixed verdict. */
export type NoiseThresholds = {
  /** Minimum firings required before any verdict other than inconclusive. */
  minSamples: number;
  /** Minimum share of resolved firings that must have cleared themselves. */
  autoResolveRatio: number;
  /** Maximum median self-clear duration, in seconds, for a noisy verdict. */
  selfClearSeconds: number;
  /** Paged share above which the alert is treated as human-actioned. */
  maxPagedRatio: number;
};

/**
 * Returns the requested percentile from an unsorted numeric sample set using
 * nearest-rank selection, which keeps small fixture sets exact and avoids
 * interpolating values that were never observed.
 *
 * @param values - Observed durations in seconds; may be unsorted.
 * @param fraction - Requested percentile expressed between 0 and 1.
 * @returns The selected value, or `0` when no samples are available.
 */
export const percentile = (values: number[], fraction: number): number => {
  if (values.length === 0) return 0;

  const sorted = [...values].sort((left, right) => left - right);
  const rank = Math.ceil(fraction * sorted.length);
  const index = Math.min(Math.max(rank, 1), sorted.length) - 1;

  return sorted[index];
};

const ratio = (numerator: number, denominator: number): number =>
  denominator === 0 ? 0 : numerator / denominator;

/**
 * Maps computed statistics onto the fixed verdict ladder. Ordering matters:
 * insufficient sample size and the paged brake are both evaluated before the
 * noisy fingerprint so neither can be overridden by a strong auto-resolve rate.
 */
const deriveVerdict = (
  score: Omit<NoiseScore, 'verdict' | 'suppressedBy'>,
  thresholds: NoiseThresholds
): NoiseScore['verdict'] => {
  if (score.samples < thresholds.minSamples) {
    return 'inconclusive';
  }

  if (score.pagedRatio > thresholds.maxPagedRatio) {
    return 'inconclusive';
  }

  const selfClearing =
    score.medianSelfClearSeconds > 0 &&
    score.medianSelfClearSeconds <= thresholds.selfClearSeconds;

  if (score.autoResolveRatio >= thresholds.autoResolveRatio && selfClearing) {
    return 'noisy';
  }

  return 'inconclusive';
};

/**
 * Computes the deterministic noise score for one alert definition.
 *
 * Percentiles rather than means drive the verdict, so a single multi-hour
 * outage cannot mask a long run of short self-clears. Unresolved firings count
 * toward `samples` but are excluded from duration statistics and never count as
 * auto-resolve evidence. A high paged share is a hard brake: an alert that
 * consistently pages a human is human-actioned by definition and yields
 * `inconclusive` even when the auto-resolve ratio is high.
 *
 * The model is never consulted here and may not alter the returned values.
 *
 * @param samples - Normalized firings for the analysis window.
 * @param thresholds - Configured decision boundaries.
 */
export const scoreNoise = (
  samples: FiringSample[],
  thresholds: NoiseThresholds
): NoiseScore => {
  const resolved = samples.filter((sample) => sample.resolution !== 'unresolved');
  const autoResolved = samples.filter((sample) => sample.resolution === 'auto');
  const durations = autoResolved
    .map((sample) => sample.durationSeconds)
    .filter((duration): duration is number => typeof duration === 'number');

  const score = {
    samples: samples.length,
    autoResolveRatio: ratio(autoResolved.length, resolved.length),
    medianSelfClearSeconds: percentile(durations, 0.5),
    p90SelfClearSeconds: percentile(durations, 0.9),
    pagedRatio: ratio(samples.filter((sample) => sample.paged).length, samples.length),
  };

  return { ...score, verdict: deriveVerdict(score, thresholds) };
};
