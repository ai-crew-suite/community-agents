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
  InsightRequestValidationError,
  normalizeInsightRequest,
  parseInsightQuery,
} from '../request';

const valid = {
  version: 1,
  entityRef: 'component:default/payment-gateway',
  question: 'Who is on-call?',
  source: 'manual',
};

describe('normalizeInsightRequest', () => {
  it('accepts a valid payload', () => {
    expect(normalizeInsightRequest(valid, { defaultSource: 'manual' })).toEqual({
      version: 1,
      entityRef: 'component:default/payment-gateway',
      question: 'Who is on-call?',
      source: 'manual',
      sessionId: undefined,
      intentHint: undefined,
    });
  });

  it('rejects non-object payloads and unknown versions', () => {
    expect(() =>
      normalizeInsightRequest('nope', { defaultSource: 'manual' }),
    ).toThrow(InsightRequestValidationError);
    expect(() =>
      normalizeInsightRequest({ ...valid, version: 2 }, { defaultSource: 'manual' }),
    ).toThrow(/version/);
  });

  it('rejects malformed entity references', () => {
    expect(() =>
      normalizeInsightRequest(
        { ...valid, entityRef: 'not a ref' },
        { defaultSource: 'manual' },
      ),
    ).toThrow(/entityRef/);
  });

  it('rejects unknown intent hints', () => {
    expect(() =>
      normalizeInsightRequest(
        { ...valid, intentHint: 'magic' },
        { defaultSource: 'manual' },
      ),
    ).toThrow(/intentHint/);
  });

  it('truncates oversized questions', () => {
    const request = normalizeInsightRequest(
      { ...valid, question: 'q'.repeat(10_000) },
      { defaultSource: 'manual' },
    );
    expect(request.question.length).toBe(2048);
  });

  it('defaults the source from the caller and honors scheduler', () => {
    expect(
      normalizeInsightRequest({ ...valid, source: undefined }, { defaultSource: 'scheduler' })
        .source,
    ).toBe('scheduler');
  });
});

describe('parseInsightQuery', () => {
  it('parses a JSON query payload', () => {
    expect(
      parseInsightQuery(JSON.stringify(valid), { defaultSource: 'manual' }).entityRef,
    ).toBe('component:default/payment-gateway');
  });

  it('rejects plain-text queries', () => {
    expect(() =>
      parseInsightQuery('who is on call?', { defaultSource: 'manual' }),
    ).toThrow(/JSON CatalogInsightRequest/);
  });
});
