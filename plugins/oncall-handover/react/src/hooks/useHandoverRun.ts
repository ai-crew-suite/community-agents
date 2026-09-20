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
import { oncallHandoverApiRef } from '../api';
import type { AiRunEvent, HandoverBrief, HandoverRequest } from '../@types';

/** Lifecycle phase of one handover compilation run. */
export type HandoverRunPhase = 'idle' | 'running' | 'finished' | 'error';

/** Render-ready accumulated state for a handover run. */
export type HandoverRunState = {
  phase: HandoverRunPhase;
  runId?: string;
  steps: { node: string; phase: 'enter' | 'exit' }[];
  tools: { tool: string; ok?: boolean; summary?: string }[];
  brief?: HandoverBrief;
  error?: string;
};

/** Initial state for an untouched handover page. */
export const initialHandoverRunState: HandoverRunState = {
  phase: 'idle',
  steps: [],
  tools: [],
};

/** Artifact kind containing the serialized brief. */
export const ONCALL_HANDOVER_BRIEF_ARTIFACT = 'oncall-handover-brief';

/** Pure event reducer shared by live and replayed SSE streams. */
export const reduceHandoverRun = (
  state: HandoverRunState,
  event: AiRunEvent
): HandoverRunState => {
  const runId = event.data.runId ?? state.runId;

  if (event.type === 'step') {
    return {
      ...state,
      runId,
      phase: 'running',
      steps: [...state.steps, { node: event.data.node, phase: event.data.phase }],
    };
  }

  if (event.type === 'tool_call') {
    return {
      ...state,
      runId,
      phase: 'running',
      tools: [...state.tools, { tool: event.data.tool }],
    };
  }

  if (event.type === 'tool_result') {
    return {
      ...state,
      runId,
      tools: [
        ...state.tools,
        { tool: event.data.tool, ok: event.data.ok, summary: event.data.summary },
      ],
    };
  }

  if (event.type === 'artifact' && event.data.kind === ONCALL_HANDOVER_BRIEF_ARTIFACT && event.data.ref) {
    try {
      return {
        ...state,
        runId,
        brief: JSON.parse(event.data.ref) as HandoverBrief,
      };
    } catch {
      return { ...state, runId };
    }
  }

  if (event.type === 'error') {
    return {
      ...state,
      runId,
      phase: 'error',
      error: event.data.message,
    };
  }

  if (event.type === 'done') {
    return {
      ...state,
      runId,
      phase: state.phase === 'error' ? 'error' : 'finished',
    };
  }

  return { ...state, runId };
};

/** Starts or replays a handover run and folds its stream into component state. */
export const useHandoverRun = () => {
  const api = useApi(oncallHandoverApiRef);

  const [state, dispatch] = useReducer(
    (current: HandoverRunState, action: { type: 'reset' } | { type: 'event'; event: AiRunEvent }) =>
      action.type === 'reset' ? initialHandoverRunState : reduceHandoverRun(current, action.event),
    initialHandoverRunState
  );

  const consume = useCallback(async (events: AsyncGenerator<AiRunEvent>) => {
    for await (const event of events) {
      dispatch({ type: 'event', event });
    }
  }, []);

  const compile = useCallback(
    (input: Omit<HandoverRequest, 'version' | 'source'>) => {
      dispatch({ type: 'reset' });
      return consume(api.compileBrief(input));
    },
    [api, consume]
  );

  const resume = useCallback(
    (runId: string) => {
      dispatch({ type: 'reset' });
      return consume(api.streamRunEvents(runId));
    },
    [api, consume]
  );

  return {
    state,
    compile,
    resume,
    reset: () => dispatch({ type: 'reset' }),
  };
};
