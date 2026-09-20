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
import { initialDriftRunState, reduceDriftRun } from '../useDriftRun';

const report = {
  entityRef: 'component:default/app',
  status: 'drifted' as const,
  items: [],
  limitations: [],
  evidence: []
};

describe('reduceDriftRun', () => {
  it('replays a drift report artifact and completes', () => {
    let state = reduceDriftRun(initialDriftRunState, {
      type: 'artifact',
      data: { runId: 'run-1', kind: 'drift-report', ref: JSON.stringify(report) }
    });

    state = reduceDriftRun(state, { type: 'done', data: { runId: 'run-1' } });

    expect(state).toMatchObject({ phase: 'finished', runId: 'run-1', report });
  });

  it('tracks progress and a future approval request', () => {
    let state = reduceDriftRun(initialDriftRunState, {
      type: 'step',
      data: { runId: 'run-1', seq: 1, node: 'delta.compute', phase: 'enter' }
    });

    state = reduceDriftRun(state, {
      type: 'approval_request',
      data: { runId: 'run-1', approvalId: 'a-1', reason: 'Open PR', effect: 'write' }
    });

    expect(state).toMatchObject({
      phase: 'waiting_approval',
      steps: [{ node: 'delta.compute', phase: 'enter' }],
      approval: { approvalId: 'a-1' }
    });
  });

  it('does not crash on a malformed artifact', () => {
    expect(
      reduceDriftRun(initialDriftRunState, {
        type: 'artifact',
        data: { runId: 'run-1', kind: 'drift-report', ref: 'bad' }
      }).report
    ).toBeUndefined();
  });
});
