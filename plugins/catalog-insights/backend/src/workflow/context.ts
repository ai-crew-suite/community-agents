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
import type { ContextItem } from './state';

const REDACTION_PATTERNS: { pattern: RegExp; replacement: string }[] = [
  // Bearer tokens (before key/value matching so the token itself is removed)
  { pattern: /Bearer\s+[A-Za-z0-9._~+/=-]+/gi, replacement: '[REDACTED]' },
  // key=value or key: value credential assignments
  {
    pattern:
      /\b(password|passwd|secret|token|api[-_]?key|access[-_]?key|authorization|credential)(=|:\s?)("?)[^\s"']+\2?/gi,
    replacement: '$1$2[REDACTED]',
  },
  // AWS-style access key IDs
  { pattern: /\b(AKIA|ASIA)[A-Z0-9]{16}\b/g, replacement: '[REDACTED_AWS_KEY_ID]' },
  // PEM blocks
  {
    pattern:
      /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    replacement: '[REDACTED_PRIVATE_KEY]',
  },
];

/**
 * Redacts credential-like strings from free text before it enters model
 * context, SSE events, artifacts, or test snapshots.
 */
export const redactSensitiveText = (text: string): string => {
  let redacted = text;
  for (const { pattern, replacement } of REDACTION_PATTERNS) {
    redacted = redacted.replace(pattern, replacement);
  }
  return redacted;
};

/**
 * Options controlling how `normalizeContext` redacts, deduplicates, orders,
 * and caps the context bundle before citation IDs are assigned.
 */
export type NormalizeContextOptions = {
  /** Maximum number of context items retained for the report. */
  maxItems: number;
  /** Maximum characters retained for a single context summary. */
  maxSummaryLength?: number;
};

/**
 * A context item before normalization. The `id` is a source-scoped hint used
 * for deduplication; normalization reassigns stable `ctx-N` citation IDs in
 * the final, capped order.
 */
export type RawContextItem = Omit<ContextItem, 'id'> & { id: string };

/**
 * Normalizes a raw context bundle: redacts summaries, deduplicates by the
 * source-scoped ID (first occurrence wins), sorts by observation time
 * (undated items last, in stable order), caps the bundle, and assigns the
 * stable `ctx-N` citation IDs used by the report and the model prompt.
 */
export const normalizeContext = (
  items: RawContextItem[],
  options: NormalizeContextOptions,
): { context: ContextItem[]; dropped: number } => {
  const maxSummaryLength = options.maxSummaryLength ?? 1_024;

  const seen = new Set<string>();
  const deduped: RawContextItem[] = [];
  for (const item of items) {
    if (seen.has(item.id)) {
      continue;
    }
    seen.add(item.id);
    deduped.push({
      ...item,
      summary: redactSensitiveText(item.summary).slice(0, maxSummaryLength),
    });
  }

  const sorted = deduped
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const aTime = a.item.observedAt ? Date.parse(a.item.observedAt) : NaN;
      const bTime = b.item.observedAt ? Date.parse(b.item.observedAt) : NaN;
      if (Number.isNaN(aTime) && Number.isNaN(bTime)) {
        return a.index - b.index;
      }
      if (Number.isNaN(aTime)) {
        return 1;
      }
      if (Number.isNaN(bTime)) {
        return -1;
      }
      return aTime - bTime;
    })
    .map(entry => entry.item);

  const capped = sorted.slice(0, options.maxItems);
  return {
    context: capped.map((item, index) => ({ ...item, id: `ctx-${index + 1}` })),
    dropped: Math.max(0, sorted.length - options.maxItems),
  };
};
