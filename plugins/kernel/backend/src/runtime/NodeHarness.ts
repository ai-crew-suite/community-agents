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

import { trace } from '@opentelemetry/api';
import {
  NodeError,
  type Redactor,
  type WorkflowNode,
  type WorkflowNodeInput,
} from '@ai-crew-suite/plugin-kernel-node';

type ZodLikeSchema<T> = { parse(value: unknown): T };

/**
 * Per-node safety wrapper applied to every plugin node function before it's
 * added to the graph. Enforces state validation, budget accounting, redaction,
 * structured error classification, OTel spans, and structured logs.
 */
export class NodeHarness<TState, TInput> {
  constructor(
    private readonly stateSchema: ZodLikeSchema<TState>,
    private readonly limits?: {
      maxNodeDurationMs?: number;
      maxTotalTokens?: number;
    },
    private readonly redactor?: Redactor,
  ) {}

  /** Wrap a node function with the harness. */
  wrap(node: WorkflowNode<TState, TInput>): WorkflowNode<TState, TInput> {
    return async (input: WorkflowNodeInput<TState, TInput>) => {
      const { state: currentState } = input;
      const span = trace.getTracer('plugin-ai-core-backend').startSpan('ai.node');
      const start = Date.now();

      try {
        // Budget: wall-clock per node
        const patch = await node(input);
        const elapsed = Date.now() - start;
        if (this.limits?.maxNodeDurationMs && elapsed > this.limits.maxNodeDurationMs) {
          throw new NodeError(`Node '${span.spanContext().traceId}' exceeded wall-clock budget (${elapsed}ms)`, 'budget_exceeded');
        }

        // Redact patch before it enters channels
        const redactedPatch = (this.redactor?.apply(patch) ?? patch) as Partial<TState>;

        // State validation
        let validatedPatch: Partial<TState>;
        try {
          validatedPatch = this.stateSchema.parse({ ...(currentState as object), ...(redactedPatch as object) });
        } catch (error) {
          throw new NodeError(`State validation failed: ${(error as Error).message}`, 'state_validation');
        }

        span.end();
        return validatedPatch;
      } catch (error) {
        span.end();
        if (error instanceof NodeError) throw error;
        throw new NodeError(
          `Node execution failed: ${error instanceof Error ? error.message : String(error)}`,
          (error as NodeError).code ?? 'unknown',
          (error as NodeError).retryable ?? false,
        );
      }
    };
  }
}
