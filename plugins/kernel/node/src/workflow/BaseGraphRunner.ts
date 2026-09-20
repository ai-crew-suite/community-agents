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
import {
  AgentRunInput,
  RunContext,
} from '../types';

/**
 * Abstract Base Class governing all stateful graph orchestration execution rings.
 * Enforces strict compliance bounds and unifies logging, telemetry, and error boundaries.
 */
export abstract class BaseGraphRunner<TState = unknown, TEvent = unknown> {
  /**
   * Universal execution hook triggered by the primary AgentRuntime router engine.
   * Isolates the event stream setup and wraps the graph thread inside structural safety nets.
   */
  public async *execute(input: AgentRunInput, context: RunContext): AsyncGenerator<TEvent, void, unknown> {
    // 1. Structural Boot Initialization Guard
    this.verifyEngineReadiness(context);

    context.logger.info('Initializing stateful graph orchestration thread', {
      runId: input.runId,
      agentId: input.agentId,
      identity: context.identity,
      timeoutBoundaryMs: context.hardening?.timeoutMs,
    });

    // 2. Setup the isolated graph execution state context
    const graphState = this.initializeGraphState(input, context);

    try {
      // 3. Delegate to the concrete subclass to execute its specific step loop actions
      const stream = this.runGraphStream(input, graphState, context);

      for await (const event of stream) {
        // Yield events (steps, token chunks, error flags) directly up to the HTTP or automation boundary
        yield event;
      }
    } catch (error: unknown) {
      const exception = error instanceof Error ? error : new Error(String(error));

      context.logger.error('Fatal execution exception caught within graph processing cycle', {
        runId: input.runId,
        agentId: input.agentId,
        errorName: exception.name || 'UnknownGraphError',
        errorMessage: exception.message,
        errorStack: exception.stack,
      });

      // Bubble up cleanly to ensure central platform sanitizers capture the drop
      throw exception;
    }

    context.logger.info('Stateful graph orchestration thread successfully closed task actions', {
      runId: input.runId,
      agentId: input.agentId,
    });
  }

  /**
   * Subclasses override this to ensure that all localized engine bindings
   * or model wrappers are cleanly mounted before executing graph paths.
   */
  protected verifyEngineReadiness(_context: RunContext): void {
    // Optional fallback; can be overridden by specific domain graphs if needed
  }

  /**
   * Instantiates the pristine, typesafe memory frame tracking this specific run context.
   */
  protected abstract initializeGraphState(input: AgentRunInput, context: RunContext): TState;

  /**
   * The pure domain execution loop mapping transitions across graph nodes.
   */
  protected abstract runGraphStream(
    input: AgentRunInput,
    initialState: TState,
    context: RunContext
  ): AsyncGenerator<TEvent, void, unknown>;
}
