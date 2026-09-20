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
import { initialHandoverRunState, reduceHandoverRun } from '../hooks/useHandoverRun';

const brief = {
  window: { start: '2026-01-01T00:00:00Z', end: '2026-01-01T12:00:00Z' },
  status: 'compiled' as const,
  highlights: [],
  activeIncidents: [],
  openTickets: [],
  notableChanges: [],
  recommendedWatchItems: [],
  limitations: [],
  signals: [],
};

describe('reduceHandoverRun', () => {
  it('reconstructs a replayed report artifact and finishes', () => {
    let state = reduceHandoverRun(initialHandoverRunState, {
      type: 'step',
      data: { runId: 'run-1', seq: 1, node: 'collect.parallel', phase: 'enter' },
    });

    state = reduceHandoverRun(state, {
      type: 'artifact',
      data: { runId: 'run-1', kind: 'oncall-handover-brief', ref: JSON.stringify(brief) },
    });

    state = reduceHandoverRun(state, {
      type: 'done',
      data: { runId: 'run-1' },
    });

    expect(state).toMatchObject({
      phase: 'finished',
      runId: 'run-1',
      brief,
    });
  });

  it('retains an error terminal state', () => {
    const state = reduceHandoverRun(initialHandoverRunState, {
      type: 'error',
      data: { runId: 'run-1', message: 'unscoped request' },
    });

    expect(state).toMatchObject({
      phase: 'error',
      error: 'unscoped request',
    });
  });
});
