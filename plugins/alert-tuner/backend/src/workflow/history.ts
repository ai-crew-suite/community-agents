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
import type { AlertHistoryEntry } from '@ai-crew-suite/plugin-kernel-node';
import type { EvidenceRef, FiringSample } from './state';

const millisecond = (value: string | undefined): number | undefined => {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};

/**
 * Normalizes provider alert history into bounded firing samples.
 *
 * Entries without a usable trigger timestamp are dropped because every
 * statistic and correlation predicate is time-based. Durations are always
 * derived here rather than trusted from the provider, and a resolved timestamp
 * that precedes its trigger is treated as unusable rather than negative.
 *
 * @param entries - Raw provider entries returned by `incident.alert.history`.
 * @param window - Inclusive analysis window; entries outside it are discarded.
 * @param maxSamples - Hard cap on retained samples, applied newest-first.
 */
export const toFiringSamples = (
  entries: AlertHistoryEntry[],
  window: { from: string; to: string },
  maxSamples: number
): FiringSample[] => {
  const from = millisecond(window.from) ?? 0;
  const to = millisecond(window.to) ?? Number.MAX_SAFE_INTEGER;

  return entries
    .flatMap((entry) => {
      const triggeredAt = millisecond(entry.triggeredAt);
      if (triggeredAt === undefined || triggeredAt < from || triggeredAt > to) {
        return [];
      }

      const resolvedAt = millisecond(entry.resolvedAt);
      const usableResolve = resolvedAt !== undefined && resolvedAt >= triggeredAt;
      const resolution: FiringSample['resolution'] =
        entry.resolution ?? (usableResolve ? 'auto' : 'unresolved');

      return [
        {
          triggeredAtMs: triggeredAt,
          sample: {
            triggeredAt: new Date(triggeredAt).toISOString(),
            resolvedAt: usableResolve ? new Date(resolvedAt).toISOString() : undefined,
            durationSeconds:
              usableResolve && resolution !== 'unresolved'
                ? Math.round((resolvedAt - triggeredAt) / 1000)
                : undefined,
            resolution,
            paged: entry.paged === true,
          },
        },
      ];
    })
    .sort((left, right) => right.triggeredAtMs - left.triggeredAtMs)
    .slice(0, Math.max(maxSamples, 0))
    .map(({ sample }, index) => ({ id: `fire-${index + 1}`, ...sample }));
};

/**
 * Builds the citable evidence bundle for a normalized sample set. Alert titles
 * and responder identities are intentionally excluded so the evidence summary
 * stays free of alert payload detail.
 */
export const toFiringEvidence = (samples: FiringSample[]): EvidenceRef[] =>
  samples.map((sample) => {
    const duration =
      sample.durationSeconds === undefined
        ? 'duration unavailable'
        : `cleared after ${sample.durationSeconds}s`;
    const paging = sample.paged ? 'paged a responder' : 'did not page';

    return {
      id: sample.id,
      source: 'alert' as const,
      summary: `Fired ${sample.triggeredAt}, ${sample.resolution}, ${duration}, ${paging}`,
    };
  });
