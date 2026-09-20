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
import { rfcAdrReviewerApiRef } from '../api';
import type {
  AiRunEvent,
  ApprovalDecision,
  CritiquePublication,
  DesignCritique,
  ReviewChannel,
  StartReviewInput,
} from '../@types';

/** Artifact kind carrying the serialized merged design critique. */
export const DESIGN_CRITIQUE_ARTIFACT = 'design-critique';

/** Artifact kind carrying an approved pull-request comment publication. */
export const CRITIQUE_PUBLICATION_ARTIFACT = 'critique-publication';

/** Workflow node that deterministically merges both review channels. */
export const COMPILATION_NODE = 'compilation';

/** The two parallel review channels rendered as debate columns. */
export const REVIEW_CHANNELS: readonly ReviewChannel[] = [
  'senior-architect',
  'security-lead',
];

/** Lifecycle phase of one review run. */
export type ReviewRunPhase =
  | 'idle'
  | 'running'
  | 'waiting_approval'
  | 'finished'
  | 'error';

/** Live progress and streamed transcript for a single review channel. */
export type ChannelState = {
  /** Whether the channel has not started, is streaming, or has exited. */
  status: 'pending' | 'running' | 'done';
  /** Concatenated node-tagged token text streamed by this channel. */
  transcript: string;
};

/** A graph-node lifecycle transition emitted by the review workflow. */
export type ReviewStep = {
  node: string;
  phase: 'enter' | 'exit';
  seq: number;
};

/** A tool invocation or its outcome, bounded by the backend tool cap. */
export type ReviewToolEvent = {
  kind: 'call' | 'result';
  tool: string;
  ok?: boolean;
  summary?: string;
};

/** Accumulated, render-ready state for one review run. */
export type ReviewRunState = {
  phase: ReviewRunPhase;
  /** Run identifier captured from the first streamed event. */
  runId?: string;
  /** Ordered graph-node transitions, including both parallel channels. */
  steps: ReviewStep[];
  /** Ordered tool invocations and results across both channels. */
  tools: ReviewToolEvent[];
  /** Per-channel debate state, keyed by review channel. */
  channels: Record<ReviewChannel, ChannelState>;
  /**
   * Token text that arrived without a `node` label. Rendered as a single
   * fallback column when the backend does not tag streamed text.
   */
  untaggedTranscript: string;
  /** Whether the deterministic compilation node has finished merging. */
  compiled: boolean;
  /** Merged critique extracted from the `design-critique` artifact. */
  critique?: DesignCritique;
  /** Publication result emitted after an approved pull-request comment. */
  publication?: CritiquePublication;
  /** Pending human approval gate, when a run suspends before a write. */
  approval?: { approvalId: string; reason: string; effect: 'read' | 'write' };
  /** Whether a human rejected the pending publication. */
  rejected: boolean;
  /** Non-recoverable error message, when the run failed. */
  error?: string;
};

/** Initial idle state with both debate columns awaiting their first event. */
export const initialReviewRunState: ReviewRunState = {
  phase: 'idle',
  steps: [],
  tools: [],
  channels: {
    'senior-architect': { status: 'pending', transcript: '' },
    'security-lead': { status: 'pending', transcript: '' },
  },
  untaggedTranscript: '',
  compiled: false,
  rejected: false,
};

/** Discriminated actions dispatched to `reduceReviewRun`. */
export type ReviewRunAction =
  | { type: 'event'; event: AiRunEvent }
  | { type: 'reset' }
  | { type: 'rejected' };

/**
 * Resolves a review channel from a workflow node label. Node labels may be
 * emitted bare (`senior-architect`) or prefixed for stream demultiplexing
 * (`node:senior-architect`); any other label is not a debate channel.
 */
const toChannel = (node: string | undefined): ReviewChannel | undefined => {
  const name = node?.startsWith('node:') ? node.slice('node:'.length) : node;
  return REVIEW_CHANNELS.find(channel => channel === name);
};

const withChannel = (
  state: ReviewRunState,
  channel: ReviewChannel,
  patch: Partial<ChannelState>,
): ReviewRunState => ({
  ...state,
  channels: {
    ...state.channels,
    [channel]: { ...state.channels[channel], ...patch },
  },
});

/**
 * Pure reducer folding one streamed run event into accumulated state. It
 * demultiplexes node-tagged `step` and `token` events into the two parallel
 * debate columns, falling back to a single untagged transcript when the
 * backend omits the optional `token.node` label.
 *
 * Exported so the streaming contract (parallel progress, merged critique
 * extraction, approval gate, rejection, replay) is unit-testable without
 * rendering React.
 */
export const reduceReviewRun = (
  state: ReviewRunState,
  action: ReviewRunAction,
): ReviewRunState => {
  if (action.type === 'reset') {
    return initialReviewRunState;
  }

  if (action.type === 'rejected') {
    return { ...state, approval: undefined, rejected: true };
  }

  const { event } = action;
  const runId = event.data.runId ?? state.runId;

  switch (event.type) {
    case 'step': {
      const channel = toChannel(event.data.node);
      const next: ReviewRunState = {
        ...state,
        runId,
        phase: state.phase === 'error' ? 'error' : 'running',
        steps: [
          ...state.steps,
          {
            node: event.data.node,
            phase: event.data.phase,
            seq: event.data.seq,
          },
        ],
        compiled:
          state.compiled ||
          (event.data.node === COMPILATION_NODE &&
            event.data.phase === 'exit'),
      };
      return channel
        ? withChannel(next, channel, {
            status: event.data.phase === 'exit' ? 'done' : 'running',
          })
        : next;
    }

    case 'token': {
      const channel = toChannel(event.data.node);
      if (!channel) {
        return {
          ...state,
          runId,
          untaggedTranscript: state.untaggedTranscript + event.data.text,
        };
      }
      const current = state.channels[channel];
      return withChannel({ ...state, runId }, channel, {
        status: current.status === 'done' ? 'done' : 'running',
        transcript: current.transcript + event.data.text,
      });
    }

    case 'tool_call':
      return {
        ...state,
        runId,
        phase: state.phase === 'error' ? 'error' : 'running',
        tools: [...state.tools, { kind: 'call', tool: event.data.tool }],
      };

    case 'tool_result':
      return {
        ...state,
        runId,
        tools: [
          ...state.tools,
          {
            kind: 'result',
            tool: event.data.tool,
            ok: event.data.ok,
            summary: event.data.summary,
          },
        ],
      };

    case 'approval_request':
      return {
        ...state,
        runId,
        phase: 'waiting_approval',
        rejected: false,
        approval: {
          approvalId: event.data.approvalId,
          reason: event.data.reason,
          effect: event.data.effect,
        },
      };

    case 'artifact': {
      if (!event.data.ref) {
        return { ...state, runId };
      }
      try {
        if (event.data.kind === DESIGN_CRITIQUE_ARTIFACT) {
          return {
            ...state,
            runId,
            critique: JSON.parse(event.data.ref) as DesignCritique,
          };
        }
        if (event.data.kind === CRITIQUE_PUBLICATION_ARTIFACT) {
          return {
            ...state,
            runId,
            publication: JSON.parse(event.data.ref) as CritiquePublication,
          };
        }
      } catch {
        // A malformed artifact payload must not break stream handling.
        return { ...state, runId };
      }
      return { ...state, runId };
    }

    case 'error':
      return { ...state, runId, phase: 'error', error: event.data.message };

    case 'done':
      return {
        ...state,
        runId,
        phase: state.phase === 'error' ? 'error' : 'finished',
        approval: undefined,
      };

    default:
      return { ...state, runId };
  }
};

/**
 * Manages one RFC/ADR review run: starting a review, replaying a persisted
 * run, submitting an approval decision, and folding streamed events into
 * render-ready per-channel state. Consuming a stream never rejects; transport
 * failures land in the `error` phase so callers can fire-and-forget.
 */
export const useReviewRun = () => {
  const api = useApi(rfcAdrReviewerApiRef);
  const [state, dispatch] = useReducer(reduceReviewRun, initialReviewRunState);

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
            message: error instanceof Error ? error.message : String(error),
          },
        },
      });
    }
  }, []);

  const startReview = useCallback(
    (input: StartReviewInput) => {
      dispatch({ type: 'reset' });
      return consume(api.startReview(input));
    },
    [api, consume],
  );

  const resume = useCallback(
    (runId: string, lastEventId?: number) => {
      dispatch({ type: 'reset' });
      return consume(api.streamRunEvents(runId, lastEventId));
    },
    [api, consume],
  );

  const decide = useCallback(
    (runId: string, decision: ApprovalDecision) => {
      if (decision.status === 'rejected') {
        dispatch({ type: 'rejected' });
      }
      return consume(api.submitApproval(runId, decision));
    },
    [api, consume],
  );

  const reset = useCallback(() => dispatch({ type: 'reset' }), []);

  return { state, startReview, resume, decide, reset };
};
