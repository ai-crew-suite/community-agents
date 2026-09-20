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
import { scaffolderPrdApiRef } from '../api';
import type { AiRunEvent, DeliveryBlueprint, StartPrdInput } from '../@types';

/** Artifact kind emitted by the blueprint-only PRD backend. */
export const DELIVERY_BLUEPRINT_ARTIFACT = 'delivery-blueprint';

/** Render-ready state accumulated from one PRD run. */
export type PrdRunState = {
  phase: 'idle' | 'running' | 'finished' | 'error';
  runId?: string;
  steps: { node: string; phase: 'enter' | 'exit' }[];
  blueprint?: DeliveryBlueprint;
  error?: string;
};

/** Initial blank PRD run state. */
export const initialPrdRunState: PrdRunState = { phase: 'idle', steps: [] };


/** Pure reducer that accepts only structurally valid delivery blueprints. */
export const reducePrdRun = (state: PrdRunState, event: AiRunEvent): PrdRunState => {
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
    event.data.kind === DELIVERY_BLUEPRINT_ARTIFACT &&
    event.data.ref
  ) {
    try {
      const blueprint = JSON.parse(event.data.ref) as DeliveryBlueprint;
      if (
        !blueprint ||
        !Array.isArray(blueprint.stories) ||
        (blueprint.status === 'blueprint_only' && !blueprint.template)
      )
        return { ...state, runId };
      return { ...state, runId, blueprint };
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

/** Starts an inline PRD translation or replays a saved blueprint stream. */
export const usePrdRun = () => {
  const api = useApi(scaffolderPrdApiRef);

  const [state, dispatch] = useReducer(
    (current: PrdRunState, action: Action) =>
      action.type === 'reset'
        ? initialPrdRunState
        : reducePrdRun(current, action.event),
    initialPrdRunState,
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

  const submit = useCallback(
    (input: StartPrdInput) => {
      dispatch({ type: 'reset' });
      return consume(api.submitPrd(input));
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

  return { state, submit, replay };
};
