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
import type {
  ToolInvocationResult,
  WorkflowContext,
} from '@ai-crew-suite/plugin-kernel-node';

export type InsightToolRunnerOptions = {
  /** Hard cap on tool invocations for a single insight run. */
  maxInvocations: number;
  /** Per-invocation timeout forwarded to the AI Core tool executor. */
  timeoutMs: number;
};

/**
 * Bounded, failure-tolerant facade over the AI Core tool executor.
 *
 * AI Core centrally enforces the agent tool allow-list, identity propagation,
 * and auditing. This runner adds the insights plugin's own context-collection
 * policy: a per-run invocation budget and graceful degradation, so a missing
 * driver or failing tool produces a report limitation instead of aborting
 * the run.
 */
export class InsightToolRunner {
  private invocations = 0;
  private readonly failures: string[] = [];

  constructor(
    private readonly context: WorkflowContext,
    private readonly options: InsightToolRunnerOptions,
  ) {}

  /** Number of tool invocations attempted so far. */
  get invocationCount(): number {
    return this.invocations;
  }

  /** Human-readable limitation entries for failed or skipped tool calls. */
  get limitations(): string[] {
    return [...this.failures];
  }

  /**
   * Invokes an allow-listed tool. Returns `undefined` when the call failed or
   * the invocation budget was exhausted; the reason is recorded as a
   * limitation for the final report.
   */
  async invoke<TArgs, TResult>(
    toolId: string,
    args: TArgs,
  ): Promise<ToolInvocationResult<TResult> | undefined> {
    if (this.invocations >= this.options.maxInvocations) {
      this.failures.push(
        `Tool '${toolId}' was skipped: insight tool budget of ${this.options.maxInvocations} invocations exhausted.`,
      );
      return undefined;
    }
    this.invocations += 1;
    try {
      return await this.context.invokeTool<TArgs, TResult>({
        toolId,
        args,
        limits: { timeoutMs: this.options.timeoutMs },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.failures.push(`Tool '${toolId}' failed: ${message}`);
      this.context.logger.warn(`Insight tool '${toolId}' failed`, {
        error: message,
      });
      return undefined;
    }
  }
}
