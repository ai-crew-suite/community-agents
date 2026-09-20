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
  buildCatalogInsightReport,
  buildDeterministicAnswer,
  parseModelInsight,
} from '../insight';
import type { ContextItem } from '../state';

const ctx = (id: string, reference?: string): ContextItem => ({
  id,
  source: 'incident',
  kind: 'oncall',
  summary: `summary for ${id}`,
  reference,
});

describe('parseModelInsight', () => {
  it('parses fenced JSON and keeps cited answer blocks', () => {
    const raw =
      'Here you go:\n```json\n{"answer":[{"text":"Alice is on-call","citations":["ctx-1"]}],"links":[],"limitations":[]}\n```';
    const parsed = parseModelInsight(raw, new Set(['ctx-1']));

    expect(parsed?.answer).toEqual([
      { text: 'Alice is on-call', citations: ['ctx-1'] },
    ]);
  });

  it('drops answer blocks and links that cite unknown context ids', () => {
    const raw = JSON.stringify({
      answer: [
        { text: 'cited', citations: ['ctx-1'] },
        { text: 'uncited', citations: ['ctx-99'] },
        { text: 'empty citations', citations: [] },
      ],
      links: [{ label: 'dash', url: 'https://example.com', citation: 'ctx-99' }],
      limitations: ['partial data'],
    });
    const parsed = parseModelInsight(raw, new Set(['ctx-1']));

    expect(parsed?.answer).toEqual([{ text: 'cited', citations: ['ctx-1'] }]);
    expect(parsed?.links).toEqual([]);
    expect(parsed?.limitations).toEqual(['partial data']);
  });

  it('returns undefined for non-JSON output', () => {
    expect(parseModelInsight('no json here', new Set())).toBeUndefined();
  });
});

describe('buildDeterministicAnswer', () => {
  it('turns every context item into a cited block', () => {
    expect(buildDeterministicAnswer([ctx('ctx-1'), ctx('ctx-2')])).toEqual([
      { text: 'summary for ctx-1', citations: ['ctx-1'] },
      { text: 'summary for ctx-2', citations: ['ctx-2'] },
    ]);
  });
});

describe('buildCatalogInsightReport', () => {
  const request = {
    version: 1 as const,
    entityRef: 'component:default/payment-gateway',
    question: 'Who is on-call?',
    source: 'manual' as const,
  };

  it('returns insufficient_context for an empty bundle', () => {
    const report = buildCatalogInsightReport({
      request,
      intent: 'ownership-oncall',
      context: [],
      limitations: [],
    });

    expect(report.status).toBe('insufficient_context');
    expect(report.answer).toEqual([]);
  });

  it('prefers valid model synthesis and marks limitations as partial', () => {
    const report = buildCatalogInsightReport({
      request,
      intent: 'ownership-oncall',
      context: [ctx('ctx-1')],
      synthesis: {
        answer: [{ text: 'Alice is on-call', citations: ['ctx-1'] }],
        links: [],
        limitations: ['pagerduty driver degraded'],
      },
      limitations: [],
    });

    expect(report.status).toBe('partial');
    expect(report.answer[0].text).toBe('Alice is on-call');
    expect(report.limitations).toContain('pagerduty driver degraded');
  });

  it('falls back to a deterministic answer when synthesis is absent', () => {
    const report = buildCatalogInsightReport({
      request,
      intent: 'observability-links',
      context: [ctx('ctx-1', 'https://example.com/dash')],
      limitations: [],
    });

    expect(report.status).toBe('partial');
    expect(report.answer).toEqual([
      { text: 'summary for ctx-1', citations: ['ctx-1'] },
    ]);
    expect(report.links).toEqual([
      { label: 'summary for ctx-1', url: 'https://example.com/dash', citation: 'ctx-1' },
    ]);
  });
});
