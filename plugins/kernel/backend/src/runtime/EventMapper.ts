/**
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

import type { AgentEvent, ErrorCode } from '@ai-crew-suite/plugin-kernel-node';

/**
 * Single owner of LangGraph stream -> AgentEvent v2 translation. Converts
 * node enter/exit updates, message tokens, custom events, tool dispatches,
 * usage metadata, and errors into the typed union. One bug-fix point for all.
 */
export class EventMapper {
  private seq = 0;

  /** Emit an ordered step event for node enter/exit. */
  step(runId: string, node: string, phase: 'enter' | 'exit'): AgentEvent {
    this.seq += 1;
    return { type: 'step', data: { runId, seq: this.seq, node, phase } };
  }

  /** Emit a node-attributed token event. */
  token(runId: string, node: string, text: string): AgentEvent {
    return { type: 'token', data: { runId, node, text } };
  }

  /** Emit node-attributed tool call/result events. */
  toolCall(runId: string, node: string, tool: string, args: unknown): AgentEvent {
    return { type: 'tool_call', data: { runId, node, tool, args } };
  }

  toolResult(runId: string, node: string, tool: string, ok: boolean, summary?: string, output?: unknown): AgentEvent {
    return { type: 'tool_result', data: { runId, node, tool, ok, summary, output } };
  }

  /** Emit a usage event (node-attributed when available). */
  usage(runId: string, input: number, output: number, total: number, node?: string): AgentEvent {
    return { type: 'usage', data: { runId, node, input, output, total } };
  }

  /** Emit an artifact event. */
  artifact(runId: string, kind: string, ref?: string, url?: string): AgentEvent {
    return { type: 'artifact', data: { runId, kind, ref, url } };
  }

  /** Emit an approval request event. */
  approvalRequest(runId: string, approvalId: string, node: string, reason: string, effect: 'write'): AgentEvent {
    return { type: 'approval_request', data: { runId, approvalId, node, reason, effect } };
  }

  /** Emit a done event. */
  done(runId: string, sessionId?: string): AgentEvent {
    return { type: 'done', data: { runId, sessionId } };
  }

  /** Emit an error event with structural classification. */
  error(runId: string, code: ErrorCode, message: string, options?: { node?: string; retryable?: boolean }): AgentEvent {
    return { type: 'error', data: { runId, code, retryable: options?.retryable ?? false, message } };
  }
}
