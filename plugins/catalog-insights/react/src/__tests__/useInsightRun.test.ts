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
  CATALOG_INSIGHT_REPORT_ARTIFACT,
  initialInsightRunState,
  reduceInsightRun,
  type InsightRunState,
} from '../hooks/useInsightRun';
import type { AiRunEvent, CatalogInsightReport } from '../@types';

const RUN_ID = 'run-123';

const fold = (events: AiRunEvent[]): InsightRunState =>
  events.reduce(
    (state, event) => reduceInsightRun(state, { type: 'event', event }),
    initialInsightRunState,
  );

const reportArtifact = (report: CatalogInsightReport): AiRunEvent => ({
  type: 'artifact',
  data: {
    runId: RUN_ID,
    kind: CATALOG_INSIGHT_REPORT_ARTIFACT,
    ref: JSON.stringify(report),
  },
});

const makeReport = (
  overrides: Partial<CatalogInsightReport> = {},
): CatalogInsightReport => ({
  entityRef: 'component:default/payment-gateway',
  question: 'Who is on call for this service?',
  intent: 'ownership-oncall',
  status: 'answered',
  answer: [
    {
      text: 'The primary on-call is the payments-platform rotation.',
      citations: ['ctx-1'],
    },
  ],
  links: [
    {
      label: 'PagerDuty schedule',
      url: 'https://example.pagerduty.com/schedules/payments',
      citation: 'ctx-1',
    },
  ],
  limitations: [],
  context: [
    {
      id: 'ctx-1',
      source: 'incident',
      kind: 'oncall',
      summary: 'On-call rotation: payments-platform',
    },
  ],
  ...overrides,
});

describe('reduceInsightRun', () => {
  it('captures the run id and tracks graph-node progress', () => {
    const state = fold([
      {
        type: 'step',
        data: {
          runId: RUN_ID,
          seq: 1,
          node: 'request.validate',
          phase: 'enter',
        },
      },
      {
        type: 'step',
        data: {
          runId: RUN_ID,
          seq: 2,
          node: 'request.validate',
          phase: 'exit',
        },
      },
      {
        type: 'step',
        data: {
          runId: RUN_ID,
          seq: 3,
          node: 'intent.classify',
          phase: 'enter',
        },
      },
    ]);

    expect(state.runId).toBe(RUN_ID);
    expect(state.phase).toBe('running');
    expect(state.steps).toHaveLength(3);
    expect(state.steps[2]).toEqual({
      node: 'intent.classify',
      phase: 'enter',
      seq: 3,
    });
  });

  it('records tool invocations and their outcomes', () => {
    const state = fold([
      {
        type: 'tool_call',
        data: { runId: RUN_ID, tool: 'incident.oncall.get', args: {} },
      },
      {
        type: 'tool_result',
        data: {
          runId: RUN_ID,
          tool: 'incident.oncall.get',
          ok: true,
          summary: 'rotation resolved',
        },
      },
      {
        type: 'tool_call',
        data: { runId: RUN_ID, tool: 'knowledge.retrieve', args: {} },
      },
      {
        type: 'tool_result',
        data: {
          runId: RUN_ID,
          tool: 'knowledge.retrieve',
          ok: false,
          summary: 'unavailable',
        },
      },
    ]);

    expect(state.toolEvents).toHaveLength(4);
    expect(state.toolEvents[3]).toEqual({
      kind: 'result',
      tool: 'knowledge.retrieve',
      ok: false,
      summary: 'unavailable',
    });
  });

  it('extracts the insight report from the report artifact', () => {
    const report = makeReport();
    const state = fold([
      reportArtifact(report),
      { type: 'done', data: { runId: RUN_ID } },
    ]);

    expect(state.report).toEqual(report);
    expect(state.phase).toBe('finished');
    expect(state.error).toBeUndefined();
  });

  it('captures an insufficient_context report outcome', () => {
    const report = makeReport({
      status: 'insufficient_context',
      answer: [],
      context: [],
    });
    const state = fold([
      reportArtifact(report),
      { type: 'done', data: { runId: RUN_ID } },
    ]);

    expect(state.report?.status).toBe('insufficient_context');
    expect(state.phase).toBe('finished');
  });

  it('enters the error phase on an error event and stays failed after finish', () => {
    let state = fold([
      {
        type: 'step',
        data: {
          runId: RUN_ID,
          seq: 1,
          node: 'request.validate',
          phase: 'enter',
        },
      },
      {
        type: 'error',
        data: { runId: RUN_ID, message: 'unknown catalog entity' },
      },
    ]);
    expect(state.phase).toBe('error');
    expect(state.error).toBe('unknown catalog entity');

    state = reduceInsightRun(state, { type: 'finished' });
    expect(state.phase).toBe('error');
  });

  it('ignores malformed report artifacts without breaking the stream', () => {
    const state = fold([
      {
        type: 'artifact',
        data: {
          runId: RUN_ID,
          kind: CATALOG_INSIGHT_REPORT_ARTIFACT,
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
          node: 'request.validate',
          phase: 'enter',
        },
      },
      reportArtifact(makeReport()),
      { type: 'done', data: { runId: RUN_ID, sessionId: 'session-1' } },
    ];
    const live = fold(events);
    // Replaying the same persisted events (as on reload) reproduces the state.
    const replayed = fold(events);
    expect(replayed).toEqual(live);
    expect(replayed.report?.entityRef).toBe(
      'component:default/payment-gateway',
    );
  });

  it('captures the session id from the done event for follow-up questions', () => {
    const state = fold([
      reportArtifact(makeReport()),
      { type: 'done', data: { runId: RUN_ID, sessionId: 'session-1' } },
    ]);
    expect(state.sessionId).toBe('session-1');

    // Starting a follow-up clears run state but keeps session continuity.
    const begun = reduceInsightRun(state, { type: 'begin' });
    expect(begun.sessionId).toBe('session-1');
    expect(begun.steps).toHaveLength(0);
    expect(begun.report).toBeUndefined();
  });

  it('resets to the initial state, dropping session continuity', () => {
    const populated = fold([
      {
        type: 'step',
        data: {
          runId: RUN_ID,
          seq: 1,
          node: 'request.validate',
          phase: 'enter',
        },
      },
      { type: 'done', data: { runId: RUN_ID, sessionId: 'session-1' } },
    ]);
    const state = reduceInsightRun(populated, { type: 'reset' });
    expect(state).toEqual(initialInsightRunState);
    expect(state.sessionId).toBeUndefined();
  });
});
