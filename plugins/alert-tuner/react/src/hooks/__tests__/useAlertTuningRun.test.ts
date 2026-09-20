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
import { initialAlertTuningRunState, reduceAlertTuningRun } from '../useAlertTuningRun';

const proposal = {
  alertId: 'cpu_high',
  status: 'partial' as const,
  window: { from: '2026-01-01', to: '2026-01-15' },
  changes: [],
  confidence: 'low' as const,
  limitations: ['Metrics unavailable'],
  evidence: []
};

describe('reduceAlertTuningRun', () => {
  it('reconstructs a replayed proposal artifact and completes', () => {
    let state = reduceAlertTuningRun(initialAlertTuningRunState, {
      type: 'artifact',
      data: {
        runId: 'run-1',
        kind: 'alert-tuning-proposal',
        ref: JSON.stringify(proposal)
      }
    });

    state = reduceAlertTuningRun(state, { type: 'done', data: { runId: 'run-1' } });

    expect(state).toMatchObject({ phase: 'finished', runId: 'run-1', proposal });
  });

  it('tracks steps and tool outcomes from streaming events', () => {
    let state = reduceAlertTuningRun(initialAlertTuningRunState, {
      type: 'step',
      data: { runId: 'run-1', seq: 1, node: 'analyze', phase: 'enter' }
    });

    state = reduceAlertTuningRun(state, {
      type: 'tool_result',
      data: { runId: 'run-1', tool: 'incident.alert.history', ok: true, summary: '15 firings' }
    });

    expect(state).toMatchObject({
      phase: 'running',
      steps: [{ node: 'analyze', phase: 'enter' }],
      tools: [{ tool: 'incident.alert.history', ok: true, summary: '15 firings' }]
    });
  });

  it('pauses at a future human approval request', () => {
    const state = reduceAlertTuningRun(initialAlertTuningRunState, {
      type: 'approval_request',
      data: { runId: 'run-1', approvalId: 'approval-1', reason: 'Open IaC PR', effect: 'write' }
    });

    expect(state).toMatchObject({
      phase: 'waiting_approval',
      approval: { approvalId: 'approval-1' }
    });
  });

  it('keeps malformed artifacts from crashing stream handling', () => {
    const state = reduceAlertTuningRun(initialAlertTuningRunState, {
      type: 'artifact',
      data: { runId: 'run-1', kind: 'alert-tuning-proposal', ref: 'not-json' }
    });

    expect(state.proposal).toBeUndefined();
    expect(state.runId).toBe('run-1');
  });
});
