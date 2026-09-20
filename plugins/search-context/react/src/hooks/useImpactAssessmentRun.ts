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
import { searchContextApiRef } from '../api';
import type { AiRunEvent, ImpactAssessment, StartImpactInput } from '../@types';

/** Artifact kind emitted by the search-context backend. */
export const IMPACT_ASSESSMENT_ARTIFACT = 'impact-assessment';

/** Render-ready state accumulated from a live or replayed assessment. */
export type ImpactAssessmentRunState = {
  phase: 'idle' | 'running' | 'finished' | 'error';
  runId?: string;
  steps: { node: string; phase: 'enter' | 'exit' }[];
  assessment?: ImpactAssessment;
  error?: string;
};

/** Initial state before an assessment is selected. */
export const initialImpactAssessmentRunState: ImpactAssessmentRunState = { phase: 'idle', steps: [] };

/** Pure reducer that ignores malformed or unrelated artifact payloads. */
export const reduceImpactAssessmentRun = (
  state: ImpactAssessmentRunState,
  event: AiRunEvent,
): ImpactAssessmentRunState => {
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
    event.data.kind === IMPACT_ASSESSMENT_ARTIFACT &&
    event.data.ref
  ) {
    try {
      const parsed = JSON.parse(event.data.ref) as ImpactAssessment;
      if (!parsed || !Array.isArray(parsed.consumers) || !parsed.counts)
        return { ...state, runId };
      return { ...state, runId, assessment: parsed };
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

/** Starts a scoped assessment or replays one persisted event stream. */
export const useImpactAssessmentRun = () => {
  const api = useApi(searchContextApiRef);

  const [state, dispatch] = useReducer(
    (current: ImpactAssessmentRunState, action: Action) =>
      action.type === 'reset'
        ? initialImpactAssessmentRunState
        : reduceImpactAssessmentRun(current, action.event),
    initialImpactAssessmentRunState,
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

  const assess = useCallback(
    (input: StartImpactInput) => {
      dispatch({ type: 'reset' });
      return consume(api.startAssessment(input));
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

  return { state, assess, replay };
};
