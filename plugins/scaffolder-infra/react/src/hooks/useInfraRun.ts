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
import { scaffolderInfraApiRef } from '../api/apiRef';
import type {
  AiRunEvent,
  InfraGenerationReport,
  PreviewGenerationInput
} from '../@types';

/** Artifact kind emitted by the persisted preview workflow. */
export const INFRA_GENERATION_REPORT_ARTIFACT = 'infra-generation-report';

/** Render-ready state for one preview or replayed preview run. */
export type InfraRunState = {
  phase: 'idle' | 'running' | 'finished' | 'error';
  runId?: string;
  steps: { node: string; phase: 'enter' | 'exit' }[];
  report?: InfraGenerationReport;
  error?: string;
};

/** Initial state before a preview begins. */
export const initialInfraRunState: InfraRunState = {
  phase: 'idle',
  steps: []
};

/** Pure SSE reducer for preview report extraction and replay. */
export const reduceInfraRun = (
  state: InfraRunState,
  event: AiRunEvent
): InfraRunState => {
  const runId = event.data.runId ?? state.runId;

  if (event.type === 'step') {
    return {
      ...state,
      runId,
      phase: 'running',
      steps: [...state.steps, { node: event.data.node, phase: event.data.phase }]
    };
  }

  if (event.type === 'artifact' && event.data.kind === INFRA_GENERATION_REPORT_ARTIFACT && event.data.ref) {
    try {
      return { ...state, runId, report: JSON.parse(event.data.ref) as InfraGenerationReport };
    } catch {
      return { ...state, runId };
    }
  }

  if (event.type === 'error') {
    return { ...state, runId, phase: 'error', error: event.data.message };
  }

  if (event.type === 'done') {
    return {
      ...state,
      runId,
      phase: state.phase === 'error' ? 'error' : 'finished'
    };
  }

  return { ...state, runId };
};

type Action =
  | { type: 'reset' }
  | { type: 'event'; event: AiRunEvent };

/** Manages non-writing preview creation and persisted event replay. */
export const useInfraRun = () => {
  const api = useApi(scaffolderInfraApiRef);

  const [state, dispatch] = useReducer(
    (current: InfraRunState, action: Action): InfraRunState =>
      action.type === 'reset' ? initialInfraRunState : reduceInfraRun(current, action.event),
    initialInfraRunState
  );

  const consume = useCallback(async (events: AsyncGenerator<AiRunEvent>) => {
    try {
      for await (const event of events) {
        dispatch({ type: 'event', event });
      }
    } catch (error) {
      dispatch({
        type: 'event',
        event: {
          type: 'error',
          data: {
            runId: 'unknown',
            message: error instanceof Error ? error.message : String(error)
          }
        }
      });
    }
  }, []);

  const preview = useCallback((input: PreviewGenerationInput) => {
    dispatch({ type: 'reset' });
    return consume(api.previewGeneration(input));
  }, [api, consume]);

  const replay = useCallback((runId: string) => {
    dispatch({ type: 'reset' });
    return consume(api.streamRunEvents(runId));
  }, [api, consume]);

  return { state, preview, replay };
};
