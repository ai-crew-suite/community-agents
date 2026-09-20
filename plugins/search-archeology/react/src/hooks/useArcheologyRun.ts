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
import { searchArcheologyApiRef } from '../api';
import type {
  AiRunEvent,
  ExpertiseMatrix,
  StartArcheologyInput,
} from '../@types';

/** Artifact kind emitted by the ticket-triage archeology backend. */
export const EXPERTISE_MATRIX_ARTIFACT = 'expertise-matrix';

/** Render-ready state collected from an archeology event stream. */
export type ArcheologyRunState = {
  phase: 'idle' | 'running' | 'finished' | 'error';
  runId?: string;
  steps: { node: string; phase: 'enter' | 'exit' }[];
  matrix?: ExpertiseMatrix;
  error?: string;
};

/** Initial blank research state. */
export const initialArcheologyRunState: ArcheologyRunState = {
  phase: 'idle',
  steps: [],
};

/** Pure reducer that extracts only the known cited expertise artifact. */
export const reduceArcheologyRun = (
  state: ArcheologyRunState,
  event: AiRunEvent,
): ArcheologyRunState => {
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
    event.data.kind === EXPERTISE_MATRIX_ARTIFACT &&
    event.data.ref
  ) {
    try {
      return {
        ...state,
        runId,
        matrix: JSON.parse(event.data.ref) as ExpertiseMatrix,
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

/** Starts ticket-only research and replays persisted events without retaining browser session memory. */
export const useArcheologyRun = () => {
  const api = useApi(searchArcheologyApiRef);

  const [state, dispatch] = useReducer(
    (current: ArcheologyRunState, action: Action) =>
      action.type === 'reset'
        ? initialArcheologyRunState
        : reduceArcheologyRun(current, action.event),
    initialArcheologyRunState,
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

  const research = useCallback(
    (input: StartArcheologyInput) => {
      dispatch({ type: 'reset' });
      return consume(api.startResearch(input));
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

  return { state, research, replay };
};
