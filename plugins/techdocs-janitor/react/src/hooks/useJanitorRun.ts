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
import { useCallback, useReducer } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { techdocsJanitorApiRef } from '../api';
import type { AiRunEvent, JanitorReport, StartJanitorInput } from '../@types';

/** Artifact kind emitted by the read-only janitor workflow. */
export const JANITOR_REPORT_ARTIFACT =
  'janitor-report';
/** Render-ready state accumulated from one audit stream. */
export type JanitorRunState = {
  phase: 'idle' | 'running' | 'finished' | 'error';
  runId?: string;
  steps: { node: string; phase: 'enter' | 'exit' }[];
  report?: JanitorReport;
  error?: string;
};

/** Initial blank audit state. */
export const initialJanitorRunState: JanitorRunState = { phase: 'idle', steps: [] };

/** Pure reducer accepting only known Janitor report artifacts. */
export const reduceJanitorRun = (state: JanitorRunState, event: AiRunEvent): JanitorRunState => {
  const runId = event.data.runId ?? state.runId;

  if (event.type === 'step')
    return {
      ...state,
      runId,
      phase: 'running',
      steps: [
        ...state.steps,
        { node: event.data.node, phase: event.data.phase },
      ],
    };

  if (
    event.type === 'artifact' &&
    event.data.kind === JANITOR_REPORT_ARTIFACT &&
    event.data.ref
  ) {
    try {
      return {
        ...state,
        runId,
        report: JSON.parse(event.data.ref) as JanitorReport,
      };
    } catch {
      return { ...state, runId };
    }
  }

  if (event.type === 'error')
    return { ...state, runId, phase: 'error', error: event.data.message };

  if (event.type === 'done')
    return {
      ...state,
      runId,
      phase: state.phase === 'error' ? 'error' : 'finished',
    };

  return { ...state, runId };
};

type Action = { type: 'reset' } | { type: 'event'; event: AiRunEvent };

/** Starts a scoped audit or replays persisted janitor events. */
export const useJanitorRun = () => {
  const api = useApi(techdocsJanitorApiRef);

  const [state, dispatch] = useReducer(
    (current: JanitorRunState, action: Action) =>
      action.type === 'reset'
        ? initialJanitorRunState
        : reduceJanitorRun(current, action.event),
    initialJanitorRunState,
  );

  const consume = useCallback(async (events: AsyncGenerator<AiRunEvent>) => {
    try {
      for await (const event of events) dispatch({ type: 'event', event });
    } catch (error) {
      dispatch({
        type: 'event',
        event: {
          type: 'error',
          data: {
            runId: 'unknown',
            message: error instanceof Error ? error.message : String(error),
          },
        },
      });
    }
  }, []);

  const audit = useCallback(
    (input: StartJanitorInput) => {
      dispatch({ type: 'reset' });
      return consume(api.startAudit(input));
    },
    [api, consume],
  );

  const replay = useCallback(
    (runId: string) => {
      dispatch({ type: 'reset' });
      return consume(api.streamRunEvents(runId));
    },
    [api, consume],
  );

  return { state, audit, replay };
};
