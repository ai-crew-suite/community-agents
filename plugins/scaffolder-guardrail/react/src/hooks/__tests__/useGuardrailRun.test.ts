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
import { initialGuardrailRunState, reduceGuardrailRun } from '../useGuardrailRun';

const assessment = {
  templateRef: 'template:default/db',
  fingerprint: 'abcd',
  status: 'negotiable' as const,
  violations: [],
  mutations: [],
  confidence: 'high' as const,
  limitations: ['advisory-only: not enforced server-side'],
  evidence: []
};

describe('reduceGuardrailRun', () => {
  it('replays an assessment artifact and completes', () => {
    let state = reduceGuardrailRun(initialGuardrailRunState, {
      type: 'artifact',
      data: { runId: 'run-1', kind: 'guardrail-assessment', ref: JSON.stringify(assessment) }
    });

    state = reduceGuardrailRun(state, { type: 'done', data: { runId: 'run-1' } });

    expect(state).toMatchObject({ phase: 'finished', runId: 'run-1', assessment });
  });

  it('tracks the real negotiation approval request', () => {
    const state = reduceGuardrailRun(initialGuardrailRunState, {
      type: 'approval_request',
      data: { runId: 'run-1', approvalId: 'a-1', reason: 'Accept mutation', effect: 'read' }
    });

    expect(state).toMatchObject({ phase: 'waiting_approval', approval: { approvalId: 'a-1' } });
  });

  it('does not crash on malformed guardrail artifacts', () => {
    expect(
      reduceGuardrailRun(initialGuardrailRunState, {
        type: 'artifact',
        data: { runId: 'run-1', kind: 'guardrail-assessment', ref: 'bad' }
      }).assessment
    ).toBeUndefined();
  });
});
