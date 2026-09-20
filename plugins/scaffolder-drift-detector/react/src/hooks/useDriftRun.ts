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
import { driftDetectorApiRef } from '../api/apiRef';
import type {
  AiRunEvent,
  ApprovalDecision,
  CheckDriftInput,
  DriftReport
} from '../@types';

/** Artifact kind emitted by the implemented read-only drift backend. */
export const DRIFT_REPORT_ARTIFACT = 'drift-report';

/** Accumulated state for one live or replayed drift run. */
export type DriftRunState = {
  phase: 'idle' | 'running' | 'waiting_approval' | 'finished' | 'error';
  runId?: string;
  steps: { node: string; phase: 'enter' | 'exit' }[];
  report?: DriftReport;
  approval?: { approvalId: string; reason: string };
  error?: string;
};

/** Initial state before a drift run begins. */
export const initialDriftRunState: DriftRunState = {
  phase: 'idle',
  steps: []
};

/** Pure event reducer exported for replay and artifact handling tests. */
export const reduceDriftRun = (state: DriftRunState, event: AiRunEvent): DriftRunState => {
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

  if (event.type === 'artifact' && event.data.kind === DRIFT_REPORT_ARTIFACT && event.data.ref) {
    try {
      return { ...state, runId, report: JSON.parse(event.data.ref) as DriftReport };
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

/** Manages check, replay, and future approval streams through the typed API. */
export const useDriftRun = () => {
  const api = useApi(driftDetectorApiRef);

  const [state, dispatch] = useReducer(
    (current: DriftRunState, action: Action): DriftRunState =>
      action.type === 'reset' ? initialDriftRunState : reduceDriftRun(current, action.event),
    initialDriftRunState
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

  const check = useCallback((input: CheckDriftInput) => {
    dispatch({ type: 'reset' });
    return consume(api.checkDrift(input));
  }, [api, consume]);

  const replay = useCallback((runId: string) => {
    dispatch({ type: 'reset' });
    return consume(api.streamRunEvents(runId));
  }, [api, consume]);

  const approve = useCallback((runId: string, decision: ApprovalDecision) =>
    consume(api.submitApproval(runId, decision)),
    [api, consume]
  );

  return { state, check, replay, approve };
};
