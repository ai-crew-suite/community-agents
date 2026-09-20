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
  EXPERTISE_MATRIX_ARTIFACT,
  initialArcheologyRunState,
  reduceArcheologyRun,
} from '../useArcheologyRun';

describe('reduceArcheologyRun', () => {
  it('extracts only the cited expertise matrix artifact', () => {
    const matrix = {
      question: 'Who knows payments?',
      scope: {
        question: 'Who knows payments?',
        paths: [],
        era: {
          since: '2024-01-01T00:00:00.000Z',
          until: '2025-01-01T00:00:00.000Z',
        },
      },
      status: 'partial',
      experts: [],
      offboardedContributors: [],
      narrative: 'Ticket evidence only.',
      confidence: 'low',
      limitations: ['Commit history unavailable.'],
      evidence: [],
    } as const;

    const next = reduceArcheologyRun(initialArcheologyRunState, {
      type: 'artifact',
      data: {
        runId: 'run-1',
        kind: EXPERTISE_MATRIX_ARTIFACT,
        ref: JSON.stringify(matrix),
      },
    });

    expect(next).toMatchObject({ runId: 'run-1', matrix });
  });

  it('keeps state stable when an artifact payload is malformed', () => {
    const next = reduceArcheologyRun(initialArcheologyRunState, {
      type: 'artifact',
      data: { runId: 'run-1', kind: EXPERTISE_MATRIX_ARTIFACT, ref: '{' },
    });

    expect(next.matrix).toBeUndefined();
    expect(next.runId).toBe('run-1');
  });
});
