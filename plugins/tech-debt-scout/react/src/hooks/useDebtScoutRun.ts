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
import { techDebtScoutApiRef } from '../api';
import type { AiRunEvent, DebtReport, StartDebtScanInput } from '../@types';

/** Artifact kind emitted by the technical-debt scout backend. */
export const TECH_DEBT_REPORT_ARTIFACT = 'tech-debt-report';

/** Render-ready state accumulated from one live or replayed scan. */
export type DebtScoutRunState = {
  phase: 'idle' | 'running' | 'finished' | 'error';
  runId?: string;
  steps: { node: string; phase: 'enter' | 'exit' }[];
  report?: DebtReport;
  error?: string;
};

/** Initial state before a repository scan begins. */
export const initialDebtScoutRunState: DebtScoutRunState = {
  phase: 'idle',
  steps: [],
};

/** Pure event reducer that accepts only a known serialized debt report artifact. */
export const reduceDebtScoutRun = (
  state: DebtScoutRunState,
  event: AiRunEvent,
): DebtScoutRunState => {
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
    event.data.kind === TECH_DEBT_REPORT_ARTIFACT &&
    event.data.ref
  ) {
    try {
      return {
        ...state,
        runId,
        report: JSON.parse(event.data.ref) as DebtReport,
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

/** Starts a scoped scan or replays one persisted report stream. */
export const useDebtScoutRun = () => {
  const api = useApi(techDebtScoutApiRef);

  const [state, dispatch] = useReducer(
    (current: DebtScoutRunState, action: Action) =>
      action.type === 'reset'
        ? initialDebtScoutRunState
        : reduceDebtScoutRun(current, action.event),
    initialDebtScoutRunState,

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

  const scan = useCallback(
    (input: StartDebtScanInput) => {
      dispatch({ type: 'reset' });
      return consume(api.startScan(input));
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

  return { state, scan, replay };
};
