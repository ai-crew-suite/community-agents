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
import { releaseNotesApiRef } from '../api';
import type {
  AiRunEvent,
  ApprovalDecision,
  ReleaseNotesDraft,
  ReleaseNotesPublication,
  ReleaseNotesRequest,
} from '../@types';

/** Lifecycle phase of one release-notes generation or resumed approval run. */
export type ReleaseNotesRunPhase = 'idle' | 'running' | 'waiting_approval' | 'finished' | 'error';

/** Render-ready state accumulated from live or replayed AI Core events. */
export type ReleaseNotesRunState = {
  phase: ReleaseNotesRunPhase;
  runId?: string;
  steps: { node: string; phase: 'enter' | 'exit' }[];
  tools: { tool: string; ok?: boolean; summary?: string }[];
  draft?: ReleaseNotesDraft;
  publication?: ReleaseNotesPublication;
  approval?: { approvalId: string; reason: string; effect: 'read' | 'write' };
  error?: string;
};

/** Initial state for the standalone release-notes page. */
export const initialReleaseNotesRunState: ReleaseNotesRunState = {
  phase: 'idle',
  steps: [],
  tools: [],
};

/** Artifact kind carrying the serialized release-notes draft. */
export const RELEASE_NOTES_DRAFT_ARTIFACT = 'release-notes-draft';

/** Artifact kind carrying a future approved publication result. */
export const RELEASE_NOTES_PUBLICATION_ARTIFACT = 'release-notes-publication';

/**
 * Folds one standard AI Core event into release-notes UI state.
 * Evaluates step changes, tool logs, approval parameters, and final artifact text mapping.
 *
 * @param state - The previous cumulative run state record.
 * @param event - The fresh incoming AI Core execution block event.
 * @returns An updated ReleaseNotesRunState state payload.
 */
export const reduceReleaseNotesRun = (
  state: ReleaseNotesRunState,
  event: AiRunEvent
): ReleaseNotesRunState => {
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

  if (event.type === 'approval_request') {
    return {
      ...state,
      runId,
      phase: 'waiting_approval',
      approval: {
        approvalId: event.data.approvalId,
        reason: event.data.reason,
        effect: event.data.effect,
      },
    };
  }

  if (event.type === 'artifact' && event.data.ref) {
    try {
      if (event.data.kind === RELEASE_NOTES_DRAFT_ARTIFACT) {
        return {
          ...state,
          runId,
          draft: JSON.parse(event.data.ref) as ReleaseNotesDraft,
        };
      }
      if (event.data.kind === RELEASE_NOTES_PUBLICATION_ARTIFACT) {
        return {
          ...state,
          runId,
          publication: JSON.parse(event.data.ref) as ReleaseNotesPublication,
        };
      }
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
      approval: undefined,
    };
  }

  return { ...state, runId };
};

/**
 * Manages generation, replay, and future approval submissions through the typed client.
 * Hooks into the backend agent pipeline, managing local React state using an underlying reducer reducer.
 *
 * @returns Bound state vectors and executable callback functions.
 */
export const useReleaseNotesRun = () => {
  const api = useApi(releaseNotesApiRef);

  const [state, dispatch] = useReducer(
    (
      current: ReleaseNotesRunState,
      action: { type: 'reset' } | { type: 'event'; event: AiRunEvent }
    ) => (action.type === 'reset' ? initialReleaseNotesRunState : reduceReleaseNotesRun(current, action.event)),
    initialReleaseNotesRunState
  );

  const consume = useCallback(async (events: AsyncGenerator<AiRunEvent>) => {
    for await (const event of events) {
      dispatch({ type: 'event', event });
    }
  }, []);

  const generate = useCallback(
    (input: Omit<ReleaseNotesRequest, 'version' | 'source'>) => {
      dispatch({ type: 'reset' });
      return consume(api.generate(input));
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

  const approve = useCallback(
    (runId: string, decision: ApprovalDecision) => consume(api.submitApproval(runId, decision)),
    [api, consume]
  );

  return {
    state,
    generate,
    resume,
    approve,
    reset: () => dispatch({ type: 'reset' }),
  };
};
