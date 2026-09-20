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
import { normalizeEvidence, redactSensitiveText } from '../evidence';
import type { IncidentEvidence } from '../state';

const item = (overrides: Partial<IncidentEvidence>): IncidentEvidence => ({
  id: 'a',
  source: 'kubernetes',
  kind: 'pod',
  summary: 'something happened',
  ...overrides,
});

describe('redactSensitiveText', () => {
  it('redacts credential assignments, bearer tokens, AWS keys, and PEM blocks', () => {
    expect(redactSensitiveText('password=hunter2')).toBe('password=[REDACTED]');
    expect(redactSensitiveText('api_key: abcdef123456')).toContain('[REDACTED]');
    expect(redactSensitiveText('Authorization: Bearer abc.def.ghi')).toBe(
      'Authorization: [REDACTED]',
    );
    expect(redactSensitiveText('key is AKIAIOSFODNN7EXAMPLE ok')).toBe(
      'key is [REDACTED_AWS_KEY_ID] ok',
    );
    const pem =
      '-----BEGIN RSA PRIVATE KEY-----\nMIIBOg==\n-----END RSA PRIVATE KEY-----';
    expect(redactSensitiveText(pem)).toBe('[REDACTED_PRIVATE_KEY]');
  });

  it('leaves ordinary text untouched', () => {
    expect(redactSensitiveText('Pod payment-gateway-1 restarted')).toBe(
      'Pod payment-gateway-1 restarted',
    );
  });
});

describe('normalizeEvidence', () => {
  it('deduplicates by ID keeping the first occurrence', () => {
    const { evidence } = normalizeEvidence(
      [item({ id: 'a', summary: 'first' }), item({ id: 'a', summary: 'second' })],
      { maxItems: 10 },
    );
    expect(evidence).toHaveLength(1);
    expect(evidence[0].summary).toBe('first');
  });

  it('sorts by observation time with undated items last in stable order', () => {
    const { evidence } = normalizeEvidence(
      [
        item({ id: 'undated' }),
        item({ id: 'late', observedAt: '2026-08-20T12:00:00Z' }),
        item({ id: 'early', observedAt: '2026-08-20T11:00:00Z' }),
      ],
      { maxItems: 10 },
    );
    expect(evidence.map(e => e.id)).toEqual(['early', 'late', 'undated']);
  });

  it('redacts summaries and caps the bundle', () => {
    const { evidence, dropped } = normalizeEvidence(
      [
        item({ id: '1', summary: 'password=secret-value happened' }),
        item({ id: '2' }),
        item({ id: '3' }),
      ],
      { maxItems: 2 },
    );
    expect(evidence).toHaveLength(2);
    expect(dropped).toBe(1);
    expect(evidence[0].summary).toContain('[REDACTED]');
    expect(evidence[0].summary).not.toContain('secret-value');
  });
});
