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
import { techRadarApiRef } from '../api';
import type { AiRunEvent, RadarAnalysis, StartRadarScanInput } from '../@types';

/** Artifact kind emitted by the scoped technology-radar backend. */
export const RADAR_ANALYSIS_ARTIFACT = 'radar-analysis';

/** Render-ready state collected from one live or replayed analysis. */
export type RadarAnalysisRunState = {
  phase: 'idle' | 'running' | 'finished' | 'error';
  runId?: string;
  steps: { node: string; phase: 'enter' | 'exit' }[];
  analysis?: RadarAnalysis;
  error?: string;
};

/** Initial blank analysis state. */
export const initialRadarAnalysisRunState: RadarAnalysisRunState = {
  phase: 'idle',
  steps: [],
};

/** Pure reducer that accepts only known radar-analysis artifacts. */
export const reduceRadarAnalysisRun = (
  state: RadarAnalysisRunState,
  event: AiRunEvent,
): RadarAnalysisRunState => {
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
    event.data.kind === RADAR_ANALYSIS_ARTIFACT &&
    event.data.ref
  ) {
    try {
      return {
        ...state,
        runId,
        analysis: JSON.parse(event.data.ref) as RadarAnalysis,
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

/** Starts a scoped radar analysis or replays one persisted analysis stream. */
export const useRadarAnalysisRun = () => {
  const api = useApi(techRadarApiRef);

  const [state, dispatch] = useReducer(
    (current: RadarAnalysisRunState, action: Action) =>
      action.type === 'reset'
        ? initialRadarAnalysisRunState
        : reduceRadarAnalysisRun(current, action.event),
    initialRadarAnalysisRunState,
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

  const analyze = useCallback(
    (input: StartRadarScanInput) => {
      dispatch({ type: 'reset' });
      return consume(api.startAnalysis(input));
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

  return { state, analyze, replay };
};
