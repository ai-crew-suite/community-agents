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
import { shadowDetectiveApiRef } from '../api';
import type {
  AiRunEvent,
  ShadowResourceReport,
  StartShadowScanInput,
} from '../@types';

/** Artifact kind emitted by the report-only shadow detective backend. */
export const SHADOW_RESOURCE_REPORT_ARTIFACT = 'shadow-resource-report';

/** Render-ready state accumulated from one live or replayed shadow scan. */
export type ShadowScanState = {
  phase: 'idle' | 'running' | 'finished' | 'error';
  runId?: string;
  steps: { node: string; phase: 'enter' | 'exit' }[];
  report?: ShadowResourceReport;
  error?: string;
};

/** Initial blank scan state. */
export const initialShadowScanState: ShadowScanState = { phase: 'idle', steps: [] };

/** Pure reducer that ignores malformed or unrelated report artifacts. */
export const reduceShadowScan = (state: ShadowScanState, event: AiRunEvent): ShadowScanState => {
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
    event.data.kind === SHADOW_RESOURCE_REPORT_ARTIFACT &&
    event.data.ref
  ) {
    try {
      const report = JSON.parse(event.data.ref) as ShadowResourceReport;
      if (!report || !Array.isArray(report.orphans))
        return { ...state, runId };
      return { ...state, runId, report };
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

/** Starts a report-only scan or replays a saved shadow report stream. */
export const useShadowScan = () => {
  const api = useApi(shadowDetectiveApiRef);

  const [state, dispatch] = useReducer(
    (current: ShadowScanState, action: Action) =>
      action.type === 'reset'
        ? initialShadowScanState
        : reduceShadowScan(current, action.event),
    initialShadowScanState,
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

  const scan = useCallback(
    (input: StartShadowScanInput) => {
      dispatch({ type: 'reset' });
      return consume(api.startScan(input));
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

  return { state, scan, replay };
};
