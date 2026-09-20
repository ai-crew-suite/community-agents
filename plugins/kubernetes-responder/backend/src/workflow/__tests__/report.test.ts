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
  buildIncidentTriageReport,
  extractJsonObject,
  findDanglingCitations,
  parseModelSynthesis,
} from '../report';
import type { IncidentEvidence, KubernetesIncidentTrigger } from '../state';

const evidence: IncidentEvidence[] = [
  { id: 'workload:a', source: 'kubernetes', kind: 'workload', summary: 'w' },
  { id: 'pod:b', source: 'kubernetes', kind: 'pod', summary: 'p' },
];

const trigger: KubernetesIncidentTrigger = {
  version: 1,
  source: 'manual',
  occurredAt: '2026-08-20T12:00:00Z',
  entityRef: 'component:default/a',
  summary: 'incident',
};

describe('extractJsonObject', () => {
  it('extracts JSON from fenced blocks and prose', () => {
    expect(extractJsonObject('Here:\n```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(extractJsonObject('prefix {"a": 1} suffix')).toBe('{"a": 1}');
    expect(extractJsonObject('no json')).toBeUndefined();
  });
});

describe('parseModelSynthesis', () => {
  const ids = new Set(evidence.map(e => e.id));

  it('parses valid synthesis with citations', () => {
    const result = parseModelSynthesis(
      JSON.stringify({
        likelyCauses: [
          { summary: 'OOM', confidence: 1.7, evidence: ['workload:a'] },
        ],
        recommendedNextSteps: ['Raise memory limit', 42],
        limitations: ['No traces available'],
      }),
      ids,
    );
    expect(result).toEqual({
      likelyCauses: [{ summary: 'OOM', confidence: 1, evidence: ['workload:a'] }],
      recommendedNextSteps: ['Raise memory limit'],
      limitations: ['No traces available'],
    });
  });

  it('drops causes citing unknown evidence IDs', () => {
    const result = parseModelSynthesis(
      JSON.stringify({
        likelyCauses: [
          { summary: 'invented', confidence: 0.9, evidence: ['pod:zzz'] },
          { summary: 'grounded', confidence: 0.7, evidence: ['pod:b'] },
        ],
      }),
      ids,
    );
    expect(result!.likelyCauses.map(c => c.summary)).toEqual(['grounded']);
  });

  it('returns undefined for invalid JSON or non-object payloads', () => {
    expect(parseModelSynthesis('not json', ids)).toBeUndefined();
    expect(parseModelSynthesis('[1,2]', ids)).toBeUndefined();
  });
});

describe('buildIncidentTriageReport', () => {
  it('prefers cited model causes and marks the run investigated', () => {
    const report = buildIncidentTriageReport({
      incidentId: 'incident-1',
      trigger,
      failureClass: 'oom-killed',
      evidence,
      deterministicCauses: ['det cause'],
      synthesis: {
        likelyCauses: [{ summary: 'model cause', confidence: 0.8, evidence: ['pod:b'] }],
        recommendedNextSteps: ['step'],
        limitations: [],
      },
      limitations: [],
    });
    expect(report.status).toBe('investigated');
    expect(report.likelyCauses).toEqual([
      { summary: 'model cause', confidence: 0.8, evidence: ['pod:b'] },
    ]);
    expect(findDanglingCitations(report)).toEqual([]);
  });

  it('falls back to deterministic causes citing all evidence', () => {
    const report = buildIncidentTriageReport({
      incidentId: 'incident-1',
      trigger,
      failureClass: 'oom-killed',
      evidence,
      deterministicCauses: ['det cause'],
      limitations: [],
    });
    expect(report.likelyCauses[0]).toEqual({
      summary: 'det cause',
      confidence: 0.6,
      evidence: ['workload:a', 'pod:b'],
    });
  });

  it('marks evidence-less runs as insufficient_evidence', () => {
    const report = buildIncidentTriageReport({
      incidentId: 'incident-1',
      trigger,
      failureClass: 'unknown',
      evidence: [],
      deterministicCauses: [],
      limitations: ['nothing collected'],
    });
    expect(report.status).toBe('insufficient_evidence');
  });
});

describe('findDanglingCitations', () => {
  it('reports citations not present in the timeline', () => {
    const report = buildIncidentTriageReport({
      incidentId: 'i',
      trigger,
      failureClass: 'unknown',
      evidence,
      deterministicCauses: ['x'],
      limitations: [],
    });
    report.likelyCauses[0].evidence.push('ghost:ref');
    expect(findDanglingCitations(report)).toEqual(['ghost:ref']);
  });
});
