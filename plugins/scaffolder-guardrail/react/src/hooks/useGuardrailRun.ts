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
import { scaffolderGuardrailApiRef } from '../api/apiRef';
import type {
  AiRunEvent,
  ApprovalDecision,
  EvaluateRequestInput,
  GuardrailAssessment,
  GuardrailResolution
} from '../@types';

/** Artifact kind emitted before advisory negotiation resolution. */
export const GUARDRAIL_ASSESSMENT_ARTIFACT = 'guardrail-assessment';

/** Artifact kind emitted after an authorized acceptance or halt. */
export const GUARDRAIL_RESOLUTION_ARTIFACT = 'guardrail-resolution';

/** Render-ready state for one evaluation, replay, or negotiation resolution. */
export type GuardrailRunState = {
  phase: 'idle' | 'running' | 'waiting_approval' | 'finished' | 'error';
  runId?: string;
  steps: { node: string; phase: 'enter' | 'exit' }[];
  assessment?: GuardrailAssessment;
  resolution?: GuardrailResolution;
  approval?: { approvalId: string; reason: string };
  error?: string;
};

/** Initial idle state. */
export const initialGuardrailRunState: GuardrailRunState = {
  phase: 'idle',
  steps: []
};

/** Folds one SSE event into state and parses only known guardrail artifacts. */
export const reduceGuardrailRun = (
  state: GuardrailRunState,
  event: AiRunEvent
): GuardrailRunState => {
  const runId = event.data.runId ?? state.runId;

  if (event.type === 'step') {
    return {
      ...state,
      runId,
      phase: 'running',
      steps: [...state.steps, { node: event.data.node, phase: event.data.phase }]
    };
  }

  if (event.type === 'approval_request') {
    return {
      ...state,
      runId,
      phase: 'waiting_approval',
      approval: { approvalId: event.data.approvalId, reason: event.data.reason }
    };
  }

  if (event.type === 'artifact' && event.data.ref) {
    try {
      if (event.data.kind === GUARDRAIL_ASSESSMENT_ARTIFACT) {
        return {
          ...state,
          runId,
          assessment: JSON.parse(event.data.ref) as GuardrailAssessment
        };
      }
      if (event.data.kind === GUARDRAIL_RESOLUTION_ARTIFACT) {
        return {
          ...state,
          runId,
          resolution: JSON.parse(event.data.ref) as GuardrailResolution
        };
      }
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
      phase: state.phase === 'error' ? 'error' : 'finished',
      approval: undefined
    };
  }

  return { ...state, runId };
};

type Action =
  | { type: 'reset' }
  | { type: 'event'; event: AiRunEvent };

/** Manages guardrail evaluation, replay, and negotiation decisions. */
export const useGuardrailRun = () => {
  const api = useApi(scaffolderGuardrailApiRef);

  const [state, dispatch] = useReducer(
    (current: GuardrailRunState, action: Action): GuardrailRunState =>
      action.type === 'reset' ? initialGuardrailRunState : reduceGuardrailRun(current, action.event),
    initialGuardrailRunState
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

  const evaluate = useCallback((input: EvaluateRequestInput) => {
    dispatch({ type: 'reset' });
    return consume(api.evaluateRequest(input));
  }, [api, consume]);

  const replay = useCallback((runId: string) => {
    dispatch({ type: 'reset' });
    return consume(api.streamRunEvents(runId));
  }, [api, consume]);

  const decide = useCallback((runId: string, decision: ApprovalDecision) =>
    consume(api.submitApproval(runId, decision)),
    [api, consume]
  );

  return { state, evaluate, replay, decide };
};
