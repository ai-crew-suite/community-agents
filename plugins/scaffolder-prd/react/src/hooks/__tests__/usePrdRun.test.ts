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
import { initialPrdRunState, reducePrdRun } from '../usePrdRun';

describe('reducePrdRun', () => {
  it('retains a valid delivery blueprint and ignores malformed artifacts', () => {
    const valid = reducePrdRun(initialPrdRunState, {
      type: 'artifact',
      data: {
        runId: 'run-1',
        kind: 'delivery-blueprint',
        ref: JSON.stringify({
          title: 'MFA',
          blueprintHash: 'hash',
          readiness: 'complete',
          stories: [],
          template: {
            templateRef: 'template:default/react',
            score: 1,
            parameters: [],
            issues: [],
            evidence: ['prd-1'],
          },
          openQuestions: [],
          limitations: [],
          evidence: [],
          status: 'blueprint_only',
        }),
      },
    });

    expect(valid.blueprint?.title).toBe('MFA');

    expect(
      reducePrdRun(valid, {
        type: 'artifact',
        data: { runId: 'run-1', kind: 'delivery-blueprint', ref: '{' },
      }).blueprint?.title,
    ).toBe('MFA');
  });

  it('retains an unparseable blueprint without a template plan', () => {
    const state = reducePrdRun(initialPrdRunState, {
      type: 'artifact',
      data: {
        runId: 'run-unparseable',
        kind: 'delivery-blueprint',
        ref: JSON.stringify({
          title: 'Unresolved product request',
          blueprintHash: 'hash',
          readiness: 'partial',
          stories: [],
          openQuestions: ['Which product capability should be planned?'],
          limitations: [],
          evidence: [],
          status: 'unparseable',
        }),
      },
    });

    expect(state.blueprint?.status).toBe('unparseable');
    expect(state.blueprint?.template).toBeUndefined();
  });
});
