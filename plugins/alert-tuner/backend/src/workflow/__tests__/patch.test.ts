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
import {
  buildAnchoredPatch,
  cappedDuration,
  cappedThreshold,
  deriveChanges,
  patchApplies,
  type PatchCaps,
} from '../patch';
import { locateThresholdAnchor } from '../locate';
import type { NoiseScore } from '../state';

const caps: PatchCaps = {
  maxThresholdIncreasePct: 15,
  maxDurationMultiplier: 3,
  peakHeadroomPct: 10,
};

const score: NoiseScore = {
  samples: 15,
  autoResolveRatio: 1,
  medianSelfClearSeconds: 90,
  p90SelfClearSeconds: 120,
  pagedRatio: 0,
  verdict: 'noisy',
};

const HCL_FILE = [
  'resource "prometheus_alert" "cpu_high" {',
  '  name      = "CPU Utilization High"',
  '  threshold = 85   # tuned by platform',
  '  for       = "2m"',
  '}',
].join('\n');

describe('threshold caps', () => {
  /** The plan's headline arithmetic: 85 may loosen toward 90, never to 300. */
  it('loosens a threshold only within the configured percentage cap', () => {
    expect(cappedThreshold(85, caps)).toBe(97);
    expect(cappedThreshold(85, caps)).toBeLessThan(85 * 1.16);
  });

  /**
   * The peak acts as a veto, not a raise: a proposal is allowed only when the
   * capped value still clears the observed peak plus its headroom.
   */
  it('allows a change only when the cap clears the observed peak', () => {
    const peak = 85;
    expect(Math.ceil(peak * 1.1)).toBeLessThanOrEqual(97);
    expect(cappedThreshold(85, caps, peak)).toBe(97);
  });

  /**
   * A peak the cap cannot clear must block the change entirely, because
   * loosening to a value the service already exceeds would disable the alert.
   */
  it('refuses a change when the peak exceeds what the cap allows', () => {
    expect(cappedThreshold(85, caps, 200)).toBeUndefined();
    expect(cappedThreshold(85, caps, 95)).toBeUndefined();
  });

  /** Durations extend toward the observed self-clear time, bounded by the multiplier. */
  it('extends a duration within the multiplier cap', () => {
    expect(cappedDuration('2m', score, caps)).toBe('4m');
    expect(cappedDuration('2m', { ...score, p90SelfClearSeconds: 100_000 }, caps)).toBe('6m');
  });
});

describe('anchored patching', () => {
  /**
   * Verifies the end-to-end pure path: locating the HCL block, deriving capped
   * changes, and emitting a diff that only touches the located lines while
   * preserving the original spacing and trailing comment.
   */
  it('emits a diff limited to the located assignment lines', () => {
    const located = locateThresholdAnchor({
      path: 'alerts.tf',
      content: HCL_FILE,
      alertName: 'cpu_high',
    });

    expect(located.ok).toBe(true);
    if (!located.ok) return;

    const changes = deriveChanges({ anchor: located.anchor, score, caps });
    const patch = buildAnchoredPatch({
      anchor: located.anchor,
      changes,
      content: HCL_FILE,
    });

    expect(patch).toBeDefined();
    expect(patch?.diff).toContain('-  threshold = 85   # tuned by platform');
    expect(patch?.diff).toContain('+  threshold = 97   # tuned by platform');
    expect(patch?.diff).toContain('+  for       = "4m"');
    expect(patch?.diff).not.toContain('resource "prometheus_alert"');
    expect(patch?.patchHash).toMatch(/^[0-9a-f]{8}$/);
  });

  /** A file mutated after locate must invalidate the patch rather than apply stale. */
  it('rejects a patch whose anchor no longer matches the file', () => {
    const located = locateThresholdAnchor({
      path: 'alerts.tf',
      content: HCL_FILE,
      alertName: 'cpu_high',
    });
    if (!located.ok) throw new Error('expected an anchor');

    const changes = deriveChanges({ anchor: located.anchor, score, caps });
    const patch = buildAnchoredPatch({ anchor: located.anchor, changes, content: HCL_FILE });
    const drifted = HCL_FILE.replace('threshold = 85', 'threshold = 70');

    expect(patch).toBeDefined();
    expect(patchApplies(patch!, HCL_FILE)).toBe(true);
    expect(patchApplies(patch!, drifted)).toBe(false);
  });
});
