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
import { normalizeContext, redactSensitiveText } from '../context';
import type { RawContextItem } from '../context';

const item = (overrides: Partial<RawContextItem>): RawContextItem => ({
  id: 'raw:1',
  source: 'catalog',
  kind: 'entity-summary',
  summary: 'summary',
  ...overrides,
});

describe('redactSensitiveText', () => {
  it('redacts bearer tokens and key/value credentials', () => {
    expect(redactSensitiveText('Authorization: Bearer abc.def.ghi')).not.toContain(
      'abc.def.ghi',
    );
    expect(redactSensitiveText('password=hunter2')).toBe('password=[REDACTED]');
  });

  it('redacts AWS access key IDs and private keys', () => {
    expect(redactSensitiveText('key is AKIAIOSFODNN7EXAMPLE')).toContain(
      '[REDACTED_AWS_KEY_ID]',
    );
    expect(
      redactSensitiveText(
        '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----',
      ),
    ).toBe('[REDACTED_PRIVATE_KEY]');
  });
});

describe('normalizeContext', () => {
  it('deduplicates by source-scoped id and assigns stable ctx-N ids', () => {
    const { context, dropped } = normalizeContext(
      [
        item({ id: 'a', summary: 'first', observedAt: '2026-08-20T10:00:00Z' }),
        item({ id: 'a', summary: 'duplicate' }),
        item({ id: 'b', summary: 'second', observedAt: '2026-08-20T09:00:00Z' }),
      ],
      { maxItems: 10 },
    );

    expect(dropped).toBe(0);
    expect(context.map(i => i.id)).toEqual(['ctx-1', 'ctx-2']);
    expect(context[0].summary).toBe('second'); // earlier timestamp sorts first
    expect(context[1].summary).toBe('first');
  });

  it('caps the bundle and reports the dropped count', () => {
    const { context, dropped } = normalizeContext(
      [item({ id: 'a' }), item({ id: 'b' }), item({ id: 'c' })],
      { maxItems: 2 },
    );

    expect(context).toHaveLength(2);
    expect(dropped).toBe(1);
  });

  it('redacts and truncates summaries', () => {
    const { context } = normalizeContext(
      [item({ summary: `token=secret ${'x'.repeat(2000)}` })],
      { maxItems: 5, maxSummaryLength: 100 },
    );

    expect(context[0].summary).not.toContain('secret');
    expect(context[0].summary.length).toBeLessThanOrEqual(100);
  });
});
