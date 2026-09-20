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
import { useCallback, useEffect, useReducer, useRef } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { catalogAiInsightsApiRef } from '../api';
import type {
  AiRunEvent,
  AskInsightInput,
  CatalogInsightReport,
} from '../@types';

/** Lifecycle phase of an insight run. */
export type InsightRunPhase = 'idle' | 'running' | 'finished' | 'error';

/** A graph-node lifecycle transition emitted by the insights workflow. */
export type StepEvent = { node: string; phase: 'enter' | 'exit'; seq: number };

/** A tool invocation or its outcome. */
export type ToolEvent = {
  kind: 'call' | 'result';
  tool: string;
  ok?: boolean;
  summary?: string;
};

/** Accumulated, render-ready state for a single insight run. */
export type InsightRunState = {
  phase: InsightRunPhase;
  /** Run identifier captured from the first streamed event. */
  runId?: string;
  /**
   * Conversation session ID returned with a finished run. Preserved across
   * follow-up questions so the backend reuses session memory.
   */
  sessionId?: string;
  /** Ordered graph-node transitions for the run progress view. */
  steps: StepEvent[];
  /** Ordered tool invocations/results for context-gathering progress. */
  toolEvents: ToolEvent[];
  /** Final insight report extracted from the report artifact. */
  report?: CatalogInsightReport;
  /** Non-recoverable error message, when the run failed. */
  error?: string;
};

/** Initial idle state for a fresh insight run. */
export const initialInsightRunState: InsightRunState = {
  phase: 'idle',
  steps: [],
  toolEvents: [],
};

/** Discriminated actions dispatched to `reduceInsightRun`. */
export type InsightRunAction =
  | { type: 'event'; event: AiRunEvent }
  | { type: 'begin' }
  | { type: 'finished' }
  | { type: 'failed'; message: string }
  | { type: 'reset' };

/** The artifact kind carrying the serialized catalog insight report. */
export const CATALOG_INSIGHT_REPORT_ARTIFACT = 'catalog-insight-report';

/**
 * Pure reducer folding a streamed run event into accumulated state. Exported
 * so the event-handling contract (progress, report extraction, insufficient
 * context, session continuity, replay) is unit-testable without rendering.
 */
export const reduceInsightRun = (
  state: InsightRunState,
  action: InsightRunAction,
): InsightRunState => {
  switch (action.type) {
    case 'reset':
      return initialInsightRunState;
    case 'begin':
      // A follow-up question clears run-specific state but keeps the session
      // continuity established by earlier runs.
      return { ...initialInsightRunState, sessionId: state.sessionId };
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
            event.data.kind !== CATALOG_INSIGHT_REPORT_ARTIFACT ||
            !event.data.ref
          ) {
            return { ...state, runId };
          }
          let report: CatalogInsightReport;
          try {
            report = JSON.parse(event.data.ref) as CatalogInsightReport;
          } catch {
            // A malformed artifact payload must not crash stream handling.
            return { ...state, runId };
          }
          return { ...state, runId, report };
        }
        case 'error':
          return { ...state, runId, phase: 'error', error: event.data.message };
        case 'done':
          return {
            ...state,
            runId,
            phase: 'finished',
            sessionId: event.data.sessionId ?? state.sessionId,
          };
        default:
          return { ...state, runId };
      }
    }
    default:
      return state;
  }
};

/**
 * Manages one insight run lifecycle: asking a question about a catalog
 * entity, replaying an existing run, and folding streamed events into
 * render-ready state. The session ID returned with a finished run is
 * preserved and resent on follow-up questions.
 */
export const useInsightRun = () => {
  const api = useApi(catalogAiInsightsApiRef);
  const [state, dispatch] = useReducer(
    reduceInsightRun,
    initialInsightRunState,
  );

  // Mirror the session ID in a ref so `ask` never reads a stale closure.
  const sessionRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    sessionRef.current = state.sessionId;
  }, [state.sessionId]);

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

  const ask = useCallback(
    (input: AskInsightInput) => {
      const sessionId = sessionRef.current;
      dispatch({ type: 'begin' });
      return consume(
        api.askQuestion(sessionId ? { ...input, sessionId } : input),
      );
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

  return { state, ask, resume, reset };
};
