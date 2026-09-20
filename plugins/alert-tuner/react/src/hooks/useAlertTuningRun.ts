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
import { alertTunerApiRef } from '../api';
import type {
  AiRunEvent,
  AlertTuningProposal,
  AlertTuningPublication,
  ApprovalDecision,
  EvaluateAlertInput
} from '../@types';

/** Artifact kind emitted by the proposal-only alert tuner backend. */
export const ALERT_TUNING_PROPOSAL_ARTIFACT = 'alert-tuning-proposal';

/** Future artifact kind emitted after an approved IaC pull request. */
export const ALERT_TUNING_PUBLICATION_ARTIFACT = 'alert-tuning-publication';

/** Lifecycle phase for an alert tuning run. */
export type AlertTuningRunPhase = 'idle' | 'running' | 'waiting_approval' | 'finished' | 'error';

/** Render-ready state accumulated from live or replayed AI Core events. */
export type AlertTuningRunState = {
  phase: AlertTuningRunPhase;
  runId?: string;
  steps: { node: string; phase: 'enter' | 'exit' }[];
  tools: { tool: string; ok?: boolean; summary?: string }[];
  proposal?: AlertTuningProposal;
  publication?: AlertTuningPublication;
  approval?: { approvalId: string; reason: string; effect: 'read' | 'write' };
  rejected: boolean;
  error?: string;
};

/** Initial state for a fresh on-demand evaluation. */
export const initialAlertTuningRunState: AlertTuningRunState = {
  phase: 'idle',
  steps: [],
  tools: [],
  rejected: false,
};

/**
 * Folds one AI Core event into accumulated tuner state. Exported so proposal
 * extraction, replay, and the future approval gate are independently testable.
 */
export const reduceAlertTuningRun = (
  state: AlertTuningRunState,
  event: AiRunEvent
): AlertTuningRunState => {
  const runId = event.data.runId ?? state.runId;

  if (event.type === 'step') {
    return {
      ...state,
      runId,
      phase: 'running',
      steps: [...state.steps, { node: event.data.node, phase: event.data.phase }]
    };
  }
  if (event.type === 'tool_call') {
    return {
      ...state,
      runId,
      phase: 'running',
      tools: [...state.tools, { tool: event.data.tool }]
    };
  }
  if (event.type === 'tool_result') {
    return {
      ...state,
      runId,
      tools: [
        ...state.tools,
        { tool: event.data.tool, ok: event.data.ok, summary: event.data.summary }
      ]
    };
  }
  if (event.type === 'approval_request') {
    return {
      ...state,
      runId,
      phase: 'waiting_approval',
      rejected: false,
      approval: {
        approvalId: event.data.approvalId,
        reason: event.data.reason,
        effect: event.data.effect
      },
    };
  }
  if (event.type === 'artifact' && event.data.ref) {
    try {
      if (event.data.kind === ALERT_TUNING_PROPOSAL_ARTIFACT) {
        return {
          ...state,
          runId,
          proposal: JSON.parse(event.data.ref) as AlertTuningProposal
        };
      }
      if (event.data.kind === ALERT_TUNING_PUBLICATION_ARTIFACT) {
        return {
          ...state,
          runId,
          publication: JSON.parse(event.data.ref) as AlertTuningPublication
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
  | { type: 'reject' }
  | { type: 'event'; event: AiRunEvent };

/** Manages alert evaluation, event replay, and future approval submission. */
export const useAlertTuningRun = () => {
  const api = useApi(alertTunerApiRef);

  const [state, dispatch] = useReducer(
    (current: AlertTuningRunState, action: Action): AlertTuningRunState => {
      if (action.type === 'reset') return initialAlertTuningRunState;
      if (action.type === 'reject') return { ...current, approval: undefined, rejected: true };
      return reduceAlertTuningRun(current, action.event);
    },
    initialAlertTuningRunState
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

  const evaluate = useCallback((input: EvaluateAlertInput) => {
    dispatch({ type: 'reset' });
    return consume(api.evaluateAlert(input));
  }, [api, consume]);

  const resume = useCallback((runId: string, lastEventId?: number) => {
    dispatch({ type: 'reset' });
    return consume(api.streamRunEvents(runId, lastEventId));
  }, [api, consume]);

  const decide = useCallback((runId: string, decision: ApprovalDecision) => {
    if (decision.status === 'rejected') {
      dispatch({ type: 'reject' });
    }
    return consume(api.submitApproval(runId, decision));
  }, [api, consume]);

  return {
    state,
    evaluate,
    resume,
    decide,
    reset: () => dispatch({ type: 'reset' })
  };
};
