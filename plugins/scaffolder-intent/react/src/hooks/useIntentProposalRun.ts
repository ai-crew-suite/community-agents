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
import { scaffolderIntentApiRef } from '../api';
import type {
  AiRunEvent,
  ScaffolderIntentProposal,
  StartIntentInput,
} from '../@types';

/** Artifact kind emitted by the current proposal-only backend milestone. */
export const TEMPLATE_INTENT_PROPOSAL_ARTIFACT = 'template-intent-proposal';

/** Render-ready state accumulated from a live or replayed intent proposal. */
export type IntentProposalRunState = {
  phase: 'idle' | 'running' | 'finished' | 'error';
  runId?: string;
  steps: { node: string; phase: 'enter' | 'exit' }[];
  proposal?: ScaffolderIntentProposal;
  error?: string;
};

/** Initial state before a provisioning intent is submitted or replayed. */
export const initialIntentProposalRunState: IntentProposalRunState = { phase: 'idle', steps: [] };

/** Pure reducer that accepts only a structurally valid template intent proposal artifact. */
export const reduceIntentProposalRun = (
  state: IntentProposalRunState,
  event: AiRunEvent,
): IntentProposalRunState => {
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
    event.data.kind === TEMPLATE_INTENT_PROPOSAL_ARTIFACT &&
    event.data.ref
  ) {
    try {
      const proposal = JSON.parse(event.data.ref) as ScaffolderIntentProposal;
      if (
        !proposal ||
        !Array.isArray(proposal.candidates) ||
        !Array.isArray(proposal.parameters) ||
        !Array.isArray(proposal.issues)
      )
        return { ...state, runId };
      return { ...state, runId, proposal };
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

/** Starts one proposal-only intent run or replays a persisted event stream. */
export const useIntentProposalRun = () => {
  const api = useApi(scaffolderIntentApiRef);

  const [state, dispatch] = useReducer(
    (current: IntentProposalRunState, action: Action) =>
      action.type === 'reset'
        ? initialIntentProposalRunState
        : reduceIntentProposalRun(current, action.event),
    initialIntentProposalRunState,
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
    (input: StartIntentInput) => {
      dispatch({ type: 'reset' });
      return consume(api.submitIntent(input));
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
