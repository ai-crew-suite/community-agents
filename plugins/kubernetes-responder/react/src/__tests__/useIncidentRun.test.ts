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
  INCIDENT_TRIAGE_REPORT_ARTIFACT,
  initialIncidentRunState,
  reduceIncidentRun,
  type IncidentRunState,
} from '../hooks/useIncidentRun';
import type { AiRunEvent, IncidentTriageReport } from '../@types';

const RUN_ID = 'run-123';

const fold = (events: AiRunEvent[]): IncidentRunState =>
  events.reduce(
    (state, event) => reduceIncidentRun(state, { type: 'event', event }),
    initialIncidentRunState,
  );

const reportArtifact = (report: IncidentTriageReport): AiRunEvent => ({
  type: 'artifact',
  data: {
    runId: RUN_ID,
    kind: INCIDENT_TRIAGE_REPORT_ARTIFACT,
    ref: JSON.stringify(report),
  },
});

const makeReport = (
  overrides: Partial<IncidentTriageReport> = {},
): IncidentTriageReport => ({
  incidentId: 'incident-1',
  entityRef: 'component:default/payments-api',
  status: 'investigated',
  failureClass: 'oom-killed',
  trigger: {
    version: 1,
    source: 'manual',
    occurredAt: '2026-01-01T00:00:00.000Z',
    entityRef: 'component:default/payments-api',
    summary: 'OOMKilled',
  },
  likelyCauses: [
    {
      summary: 'Container exceeded its memory limit',
      confidence: 0.9,
      evidence: ['pod:prod/default/payments-api-1'],
    },
  ],
  timeline: [
    {
      id: 'pod:prod/default/payments-api-1',
      source: 'kubernetes',
      kind: 'pod',
      summary: 'Container OOMKilled',
      confidence: 'high',
    },
  ],
  recommendedNextSteps: ['Raise the memory limit'],
  limitations: [],
  ...overrides,
});

describe('reduceIncidentRun', () => {
  it('captures the run id and tracks graph-node progress', () => {
    const state = fold([
      {
        type: 'step',
        data: {
          runId: RUN_ID,
          seq: 1,
          node: 'trigger.validate',
          phase: 'enter',
        },
      },
      {
        type: 'step',
        data: {
          runId: RUN_ID,
          seq: 2,
          node: 'trigger.validate',
          phase: 'exit',
        },
      },
      {
        type: 'step',
        data: {
          runId: RUN_ID,
          seq: 3,
          node: 'workload.resolve',
          phase: 'enter',
        },
      },
    ]);

    expect(state.runId).toBe(RUN_ID);
    expect(state.phase).toBe('running');
    expect(state.steps).toHaveLength(3);
    expect(state.steps[2]).toEqual({
      node: 'workload.resolve',
      phase: 'enter',
      seq: 3,
    });
  });

  it('records tool invocations and their outcomes', () => {
    const state = fold([
      {
        type: 'tool_call',
        data: { runId: RUN_ID, tool: 'kubernetes.workload.resolve', args: {} },
      },
      {
        type: 'tool_result',
        data: {
          runId: RUN_ID,
          tool: 'kubernetes.workload.resolve',
          ok: true,
          summary: 'resolved',
        },
      },
      {
        type: 'tool_call',
        data: { runId: RUN_ID, tool: 'kubernetes.pod.get_logs', args: {} },
      },
      {
        type: 'tool_result',
        data: {
          runId: RUN_ID,
          tool: 'kubernetes.pod.get_logs',
          ok: false,
          summary: 'unavailable',
        },
      },
    ]);

    expect(state.toolEvents).toHaveLength(4);
    expect(state.toolEvents[3]).toEqual({
      kind: 'result',
      tool: 'kubernetes.pod.get_logs',
      ok: false,
      summary: 'unavailable',
    });
  });

  it('extracts the triage report from the report artifact', () => {
    const report = makeReport();
    const state = fold([
      reportArtifact(report),
      { type: 'done', data: { runId: RUN_ID } },
    ]);

    expect(state.report).toEqual(report);
    expect(state.phase).toBe('finished');
    expect(state.error).toBeUndefined();
  });

  it('captures an insufficient_evidence report outcome', () => {
    const report = makeReport({
      status: 'insufficient_evidence',
      likelyCauses: [],
    });
    const state = fold([
      reportArtifact(report),
      { type: 'done', data: { runId: RUN_ID } },
    ]);

    expect(state.report?.status).toBe('insufficient_evidence');
    expect(state.phase).toBe('finished');
  });

  it('enters the error phase on an error event and stays failed after finish', () => {
    let state = fold([
      {
        type: 'step',
        data: {
          runId: RUN_ID,
          seq: 1,
          node: 'trigger.validate',
          phase: 'enter',
        },
      },
      {
        type: 'error',
        data: { runId: RUN_ID, message: 'trigger validation failed' },
      },
    ]);
    expect(state.phase).toBe('error');
    expect(state.error).toBe('trigger validation failed');

    state = reduceIncidentRun(state, { type: 'finished' });
    expect(state.phase).toBe('error');
  });

  it('ignores malformed report artifacts without breaking the stream', () => {
    const state = fold([
      {
        type: 'artifact',
        data: {
          runId: RUN_ID,
          kind: INCIDENT_TRIAGE_REPORT_ARTIFACT,
          ref: '{not-json',
        },
      },
      {
        type: 'artifact',
        data: { runId: RUN_ID, kind: 'unrelated-artifact', ref: '{}' },
      },
      { type: 'done', data: { runId: RUN_ID } },
    ]);

    expect(state.report).toBeUndefined();
    expect(state.phase).toBe('finished');
  });

  it('replays a stored event stream into the same accumulated state', () => {
    const events: AiRunEvent[] = [
      {
        type: 'step',
        data: {
          runId: RUN_ID,
          seq: 1,
          node: 'trigger.validate',
          phase: 'enter',
        },
      },
      reportArtifact(makeReport()),
      { type: 'done', data: { runId: RUN_ID } },
    ];
    const live = fold(events);
    // Replaying the same persisted events (as on reload) reproduces the state.
    const replayed = fold(events);
    expect(replayed).toEqual(live);
    expect(replayed.report?.incidentId).toBe('incident-1');
  });

  it('resets to the initial state', () => {
    const populated = fold([
      {
        type: 'step',
        data: {
          runId: RUN_ID,
          seq: 1,
          node: 'trigger.validate',
          phase: 'enter',
        },
      },
    ]);
    const state = reduceIncidentRun(populated, { type: 'reset' });
    expect(state).toEqual(initialIncidentRunState);
  });
});
