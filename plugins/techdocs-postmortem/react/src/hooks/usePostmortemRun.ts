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
import { techdocsPostmortemApiRef } from '../api';
import type { AiRunEvent, PostmortemDraft } from '../@types';

/** Artifact kind emitted by the read-only postmortem workflow. */
export const POSTMORTEM_DRAFT_ARTIFACT = 'postmortem-draft';

/** Render-ready state accumulated from one postmortem draft stream. */
export type PostmortemRunState = {
  phase: 'idle' | 'running' | 'finished' | 'error';
  runId?: string;
  steps: { node: string; phase: 'enter' | 'exit' }[];
  draft?: PostmortemDraft;
  error?: string;
};

/** Initial blank postmortem state. */
export const initialPostmortemRunState: PostmortemRunState = { phase: 'idle', steps: [] };

/** Pure reducer accepting only known postmortem draft artifacts. */
export const reducePostmortemRun = (state: PostmortemRunState, event: AiRunEvent): PostmortemRunState => {
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
    event.data.kind === POSTMORTEM_DRAFT_ARTIFACT &&
    event.data.ref
  ) {
    try {
      return {
        ...state,
        runId,
        draft: JSON.parse(event.data.ref) as PostmortemDraft,
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

/** Starts an incident timeline draft or replays an existing run. */
export const usePostmortemRun = () => {
  const api = useApi(techdocsPostmortemApiRef);

  const [state, dispatch] = useReducer(
    (current: PostmortemRunState, action: Action) =>
      action.type === 'reset'
        ? initialPostmortemRunState
        : reducePostmortemRun(current, action.event),
    initialPostmortemRunState,
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

  const draft = useCallback(
    (incidentId: string) => {
      dispatch({ type: 'reset' });
      return consume(api.startDraft(incidentId));
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

  return { state, draft, replay };
};
