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
import type { FilePatch, NoiseScore, ThresholdAnchor, ThresholdChange } from './state';

/** Deterministic safety caps bounding every proposed value change. */
export type PatchCaps = {
  /** Maximum percentage a numeric threshold may be loosened by. */
  maxThresholdIncreasePct: number;
  /** Maximum multiple the current duration may be extended to. */
  maxDurationMultiplier: number;
  /** Headroom kept above an observed metric peak, as a percentage. */
  peakHeadroomPct: number;
};

const DURATION_UNIT_SECONDS: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };

/** Parses a Prometheus-style duration such as `2m` into seconds. */
export const parseDuration = (value: string): number | undefined => {
  const match = /^(\d+)([smhd])$/.exec(value.trim());
  if (!match) return undefined;
  return Number(match[1]) * DURATION_UNIT_SECONDS[match[2]];
};

/** Formats seconds back into the compact duration unit that reads most naturally. */
export const formatDuration = (seconds: number): string => {
  if (seconds % 86400 === 0) return `${seconds / 86400}d`;
  if (seconds % 3600 === 0) return `${seconds / 3600}h`;
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
};

/**
 * Derives a stable, short hash for a diff so an approved patch can be pinned
 * across the checkpoint and resume boundary. This is an integrity token for
 * change detection, not a cryptographic digest.
 */
export const hashPatch = (diff: string): string => {
  let hash = 0x811c9dc5;

  for (let index = 0; index < diff.length; index += 1) {
    hash ^= diff.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return hash.toString(16).padStart(8, '0');
};

/**
 * Computes the capped replacement for a numeric threshold.
 *
 * The percentage cap is absolute: the result is never allowed to exceed it, even
 * to clear an observed metric peak. The peak therefore acts as a **veto** rather
 * than a raise — when the peak plus its headroom will not fit under the cap, no
 * change is proposed at all, because loosening to a value the service already
 * exceeds would silently disable the alert.
 *
 * @param current - The located current threshold value.
 * @param caps - Configured deterministic caps.
 * @param observedPeak - Highest observed metric value, when metrics are available.
 * @returns The capped new threshold, or `undefined` when no safe change exists.
 */
export const cappedThreshold = (
  current: number,
  caps: PatchCaps,
  observedPeak?: number
): number | undefined => {
  const maxAllowed = Math.floor(current * (1 + caps.maxThresholdIncreasePct / 100));

  if (maxAllowed <= current) {
    return undefined;
  }

  if (observedPeak !== undefined) {
    const required = Math.ceil(observedPeak * (1 + caps.peakHeadroomPct / 100));

    if (required > maxAllowed) {
      return undefined;
    }
  }

  return maxAllowed;
};

/**
 * Computes the capped replacement duration from the observed self-clear
 * behaviour. The p90 self-clear time plus one interval is the target, bounded by
 * the configured multiplier, so the alert outlives typical transient blips
 * without becoming unboundedly slow to fire.
 *
 * @returns The capped duration string, or `undefined` when no change is warranted.
 */
export const cappedDuration = (
  current: string,
  score: NoiseScore,
  caps: PatchCaps
): string | undefined => {
  const currentSeconds = parseDuration(current);
  if (currentSeconds === undefined || currentSeconds <= 0) {
    return undefined;
  }

  const ceiling = currentSeconds * caps.maxDurationMultiplier;
  const target = Math.max(score.p90SelfClearSeconds + currentSeconds, currentSeconds);
  const chosen = Math.min(target, ceiling);

  if (chosen <= currentSeconds) {
    return undefined;
  }

  return formatDuration(Math.round(chosen / currentSeconds) * currentSeconds);
};

/**
 * Derives every capped change for a located anchor. Threshold and duration are
 * independent: a block exposing only one tunable field still yields a proposal.
 */
export const deriveChanges = (input: {
  anchor: ThresholdAnchor;
  score: NoiseScore;
  caps: PatchCaps;
  observedPeak?: number;
}): ThresholdChange[] => {
  const changes: ThresholdChange[] = [];
  const { anchor, score, caps } = input;

  if (anchor.currentThreshold) {
    const current = Number(anchor.currentThreshold.value);
    const next = Number.isFinite(current)
      ? cappedThreshold(current, caps, input.observedPeak)
      : undefined;

    if (next !== undefined) {
      changes.push({
        field: 'threshold',
        from: anchor.currentThreshold.value,
        to: String(next),
        rationale:
          `${score.samples} firings with an auto-resolve ratio of ` +
          `${score.autoResolveRatio.toFixed(2)} and a median self-clear of ` +
          `${score.medianSelfClearSeconds}s; loosened within the ` +
          `${caps.maxThresholdIncreasePct}% cap.`,
      });
    }
  }

  if (anchor.currentDuration) {
    const next = cappedDuration(anchor.currentDuration.value, score, caps);

    if (next !== undefined) {
      changes.push({
        field: 'duration',
        from: anchor.currentDuration.value,
        to: next,
        rationale:
          `p90 self-clear was ${score.p90SelfClearSeconds}s; extended within the ` +
          `${caps.maxDurationMultiplier}x duration cap so transient blips stop paging.`,
      });
    }
  }

  return changes;
};

/** One anchored replacement: the exact line to rewrite and its new content. */
type LineEdit = { line: number; before: string; after: string };

/**
 * Rewrites only the value inside a located assignment line, preserving the
 * original indentation, operator spacing, quoting, and trailing comment
 * byte-for-byte. Only the matched value token is substituted.
 */
const rewriteValue = (raw: string, from: string, to: string): string => {
  const index = raw.indexOf(from);
  if (index === -1) {
    return raw;
  }
  return raw.slice(0, index) + to + raw.slice(index + from.length);
};

const toEdits = (anchor: ThresholdAnchor, changes: ThresholdChange[]): LineEdit[] =>
  changes.flatMap((change) => {
    const field =
      change.field === 'threshold' ? anchor.currentThreshold : anchor.currentDuration;

    if (!field) return [];

    return [
      {
        line: field.line,
        before: field.raw,
        after: rewriteValue(field.raw, change.from, change.to),
      },
    ];
  });

/**
 * Builds an anchored unified diff for the derived changes and verifies it
 * against the exact file content it was cut from.
 *
 * Every hunk is pinned to a located line number and each context line is
 * checked against the source, so a diff that would touch an unmatched or
 * drifted line is rejected rather than emitted. This is what keeps a threshold
 * edit a surgical replacement instead of a speculative rewrite.
 *
 * @param input - The anchor, derived changes, and the file content read during locate.
 * @returns The validated patch, or `undefined` when nothing safe can be emitted.
 */
export const buildAnchoredPatch = (input: {
  anchor: ThresholdAnchor;
  changes: ThresholdChange[];
  content: string;
}): FilePatch | undefined => {
  const lines = input.content.split('\n');
  const edits = toEdits(input.anchor, input.changes).sort((left, right) => left.line - right.line);

  if (edits.length === 0) {
    return undefined;
  }

  const hunks: string[] = [];

  for (const edit of edits) {
    const index = edit.line - 1;

    // Reject the patch outright when the anchor no longer matches the source:
    // a drifted file must abort, never be force-patched.
    if (lines[index] !== edit.before || edit.after === edit.before) {
      return undefined;
    }

    hunks.push(
      `@@ -${edit.line},1 +${edit.line},1 @@`,
      `-${edit.before}`,
      `+${edit.after}`
    );
  }

  const diff = [
    `--- a/${input.anchor.path}`,
    `+++ b/${input.anchor.path}`,
    ...hunks,
    '',
  ].join('\n');

  return { path: input.anchor.path, diff, patchHash: hashPatch(diff) };
};

/**
 * Re-verifies a previously built patch against current file content. Used
 * before an approval gate and again on resume so an IaC file mutated in the
 * meantime aborts the publish instead of applying a stale change.
 */
export const patchApplies = (patch: FilePatch, content: string): boolean => {
  const lines = content.split('\n');
  const hunkHeader = /^@@ -(\d+),1 \+\d+,1 @@$/;
  const diffLines = patch.diff.split('\n');
  let verified = 0;

  for (let index = 0; index < diffLines.length; index += 1) {
    const header = hunkHeader.exec(diffLines[index]);
    if (!header) continue;

    const removed = diffLines[index + 1];
    if (removed?.[0] !== '-') {
      return false;
    }

    if (lines[Number(header[1]) - 1] !== removed.slice(1)) {
      return false;
    }

    verified += 1;
  }

  return verified > 0;
};
