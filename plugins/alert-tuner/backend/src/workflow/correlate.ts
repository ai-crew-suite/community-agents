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
import type { EvidenceRef, FiringSample, NoiseScore } from './state';

/** A real-signal window that suppresses overlapping firings. */
export type SuppressionWindow = {
  /** Evidence ID (`inc-N` or `deploy-N`) recorded when this window suppresses. */
  id: string;
  /** ISO-8601 window start. */
  start: string;
  /** ISO-8601 window end; open-ended windows fall back to the start instant. */
  end?: string;
};

/** Shape shared by incident and deploy records returned from read-only tools. */
type CorrelationRecord = Record<string, unknown>;

/**
 * Strict ISO-8601 extended format matching pattern.
 * Requires: YYYY-MM-DD
 * Optional: THH:mm:ss (.sss)? (Z | [+-]HH:mm | [+-]HHmm)?
 */
const ISO_8601_REGEX = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

/**
 * Validates an incoming timestamp string structure and returns its absolute millisecond epoch value.
 * Explicitly guards against partial, malicious, or non-deterministic platform-dependent date parse fragments.
 *
 * @param value The candidate date string under evaluation.
 * @returns The timestamp integer, or undefined if the string is empty, malformed, or invalid.
 */
const millisecond = (value: string | undefined): number | undefined => {
  if (!value || !ISO_8601_REGEX.test(value)) {
    return undefined;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};

/**
 * Normalizes provider helper keys into isolated string instances.
 */
const optionalString = (record: CorrelationRecord, ...keys: string[]): string | undefined => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value) return value;
  }
  return undefined;
};

/**
 * Tests whether a firing overlaps a real-signal window, padded symmetrically on both bounds.
 *
 * The pad is applied to the suppression window rather than the firing so a
 * short self-clear immediately before a declared incident still correlates.
 *
 * @param sample - The firing under evaluation.
 * @param window - The incident or deploy window to compare against.
 * @param padMinutes - Symmetric tolerance applied to the window bounds in minutes.
 */
export const overlaps = (
  sample: FiringSample,
  window: SuppressionWindow,
  padMinutes: number
): boolean => {
  const firingStart = millisecond(sample.triggeredAt);
  const windowStart = millisecond(window.start);

  if (firingStart === undefined || windowStart === undefined) {
    return false;
  }

  const pad = Math.max(padMinutes, 0) * 60 * 1000;
  const firingEnd = millisecond(sample.resolvedAt) ?? firingStart;
  const windowEnd = millisecond(window.end) ?? windowStart;

  return firingStart <= windowEnd + pad && firingEnd >= windowStart - pad;
};

/**
 * Applies real-signal suppression rules over a pre-computed noise score structure.
 *
 * Any overlap between a firing and a genuine incident or remediating deploy
 * flips the verdict to `real_signal`, which removes the patch path entirely.
 *
 * @param score - The deterministic score produced by `scoreNoise`.
 * @param samples - The firings the score was computed from.
 * @param windows - Incident and deploy windows gathered from read-only tools.
 * @param padMinutes - Configured correlation tolerance in minutes.
 */
export const applySuppression = (
  score: NoiseScore,
  samples: FiringSample[],
  windows: SuppressionWindow[],
  padMinutes: number
): NoiseScore => {
  const suppressedBy = windows
    .filter((window) => samples.some((sample) => overlaps(sample, window, padMinutes)))
    .map((window) => window.id);

  if (suppressedBy.length === 0) {
    return score;
  }

  return { 
    ...score, 
    verdict: 'real_signal', 
    suppressedBy: [...new Set(suppressedBy)] 
  };
};

/**
 * Normalizes provider incident or deploy records into suppression windows and
 * their matching evidence entries. Records without a usable start timestamp are
 * dropped because an untimed record cannot be correlated with a firing.
 *
 * @param records - Raw tool output rows.
 * @param options - Evidence prefix, source label, and retention cap.
 */
export const toSuppressionWindows = (
  records: unknown,
  options: {
    prefix: string;
    source: Extract<EvidenceRef['source'], 'incident' | 'deploy'>;
    max: number;
  }
): { windows: SuppressionWindow[]; evidence: EvidenceRef[] } => {
  const rows = Array.isArray(records) ? records : [];
  const windows: SuppressionWindow[] = [];
  const evidence: EvidenceRef[] = [];

  for (const row of rows.slice(0, Math.max(options.max, 0))) {
    if (typeof row !== 'object' || row === null) continue;

    const record = row as CorrelationRecord;
    const start = optionalString(record, 'triggeredAt', 'startedAt', 'observedAt', 'timestamp');

    if (!start) continue;

    const id = `${options.prefix}-${windows.length + 1}`;

    windows.push({
      id,
      start,
      end: optionalString(record, 'resolvedAt', 'endedAt', 'completedAt'),
    });

    evidence.push({
      id,
      source: options.source,
      summary: optionalString(record, 'title', 'summary', 'reason', 'message') ?? 'Correlated event',
      reference: optionalString(record, 'url', 'htmlUrl', 'id'),
    });
  }

  return { windows, evidence };
};
