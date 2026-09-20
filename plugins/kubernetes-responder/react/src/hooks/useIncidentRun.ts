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
import { kubernetesAiResponderApiRef } from '../api';
import type {
  AiRunEvent,
  IncidentTriageReport,
  ManualInvestigationInput,
} from '../@types';

/** Lifecycle phase of an investigation run. */
export type IncidentRunPhase = 'idle' | 'running' | 'finished' | 'error';

/** A graph-node lifecycle transition emitted by the triage workflow. */
export type StepEvent = { node: string; phase: 'enter' | 'exit'; seq: number };

/** A tool invocation or its outcome. */
export type ToolEvent = {
  kind: 'call' | 'result';
  tool: string;
  ok?: boolean;
  summary?: string;
};

/** Accumulated, render-ready state for a single investigation run. */
export type IncidentRunState = {
  phase: IncidentRunPhase;
  /** Run identifier captured from the first streamed event. */
  runId?: string;
  /** Ordered graph-node transitions for the run timeline. */
  steps: StepEvent[];
  /** Ordered tool invocations/results for evidence-collection progress. */
  toolEvents: ToolEvent[];
  /** Final triage report extracted from the report artifact. */
  report?: IncidentTriageReport;
  /** Non-recoverable error message, when the run failed. */
  error?: string;
};

/** Initial idle state for a fresh investigation run. */
export const initialIncidentRunState: IncidentRunState = {
  phase: 'idle',
  steps: [],
  toolEvents: [],
};

/** Discriminated actions dispatched to `reduceIncidentRun`. */
export type IncidentRunAction =
  | { type: 'event'; event: AiRunEvent }
  | { type: 'finished' }
  | { type: 'failed'; message: string }
  | { type: 'reset' };

/** The artifact kind carrying the serialized triage report. */
export const INCIDENT_TRIAGE_REPORT_ARTIFACT = 'incident-triage-report';

/**
 * Pure reducer folding a streamed run event into accumulated state. Exported so
 * the event-handling contract (progress, report extraction, tool failure,
 * insufficient evidence, replay) is unit-testable without rendering.
 */
export const reduceIncidentRun = (
  state: IncidentRunState,
  action: IncidentRunAction,
): IncidentRunState => {
  switch (action.type) {
    case 'reset':
      return initialIncidentRunState;
    case 'failed':
      return { ...state, phase: 'error', error: action.message };
    case 'finished':
      return {
        ...state,
        phase: state.phase === 'error' ? 'error' : 'finished',
      };
    case 'event': {
      const { event } = action;
      const runId = (event.data as { runId?: string }).runId ?? state.runId;
      switch (event.type) {
        case 'step':
          return {
            ...state,
            runId,
            phase: 'running',
            steps: [
              ...state.steps,
              {
                node: event.data.node,
                phase: event.data.phase,
                seq: event.data.seq,
              },
            ],
          };
        case 'tool_call':
          return {
            ...state,
            runId,
            phase: 'running',
            toolEvents: [
              ...state.toolEvents,
              { kind: 'call', tool: event.data.tool },
            ],
          };
        case 'tool_result':
          return {
            ...state,
            runId,
            toolEvents: [
              ...state.toolEvents,
              {
                kind: 'result',
                tool: event.data.tool,
                ok: event.data.ok,
                summary: event.data.summary,
              },
            ],
          };
        case 'artifact': {
          if (
            event.data.kind !== INCIDENT_TRIAGE_REPORT_ARTIFACT ||
            !event.data.ref
          ) {
            return { ...state, runId };
          }
          let report: IncidentTriageReport;
          try {
            report = JSON.parse(event.data.ref) as IncidentTriageReport;
          } catch {
            // A malformed artifact payload must not crash stream handling.
            return { ...state, runId };
          }
          return { ...state, runId, report };
        }
        case 'error':
          return { ...state, runId, phase: 'error', error: event.data.message };
        case 'done':
          return { ...state, runId, phase: 'finished' };
        default:
          return { ...state, runId };
      }
    }
    default:
      return state;
  }
};

/**
 * Manages one investigation run lifecycle: starting a manual investigation,
 * replaying an existing run, and folding streamed events into render-ready state.
 */
export const useIncidentRun = () => {
  const api = useApi(kubernetesAiResponderApiRef);
  const [state, dispatch] = useReducer(
    reduceIncidentRun,
    initialIncidentRunState,
  );

  // Consumes an event stream into state. Never rejects: stream errors become
  // the `error` phase so callers can fire-and-forget.
  const consume = useCallback(async (events: AsyncGenerator<AiRunEvent>) => {
    try {
      for await (const event of events) {
        dispatch({ type: 'event', event });
      }
      dispatch({ type: 'finished' });
    } catch (e) {
      dispatch({
        type: 'failed',
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }, []);

  const start = useCallback(
    (input: ManualInvestigationInput) => {
      dispatch({ type: 'reset' });
      return consume(api.startInvestigation(input));
    },
    [api, consume],
  );

  const resume = useCallback(
    (runId: string) => {
      dispatch({ type: 'reset' });
      return consume(api.streamRunEvents(runId));
    },
    [api, consume],
  );

  const reset = useCallback(() => dispatch({ type: 'reset' }), []);

  return { state, start, resume, reset };
};
