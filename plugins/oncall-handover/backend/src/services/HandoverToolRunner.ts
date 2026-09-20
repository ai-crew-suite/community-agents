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
import type { ToolInvocationResult, WorkflowContext } from '@ai-crew-suite/plugin-kernel-node';

/**
 * Bounded and failure-tolerant facade for read-only handover tool calls.
 */
export class HandoverToolRunner {
  private calls = 0;
  private readonly failures: string[] = [];

  /**
   * Creates an instance of HandoverToolRunner.
   *
   * @param context - The execution context provided by the workflow engine.
   * @param options - Configuration options for limiting tool execution.
   * @param options.maxInvocations - Maximum allowed tool calls before budget exhaustion.
   * @param options.timeoutMs - Optional maximum execution time in milliseconds for each call.
   */
  constructor(
    private readonly context: WorkflowContext,
    private readonly options: { maxInvocations: number; timeoutMs?: number }
  ) {}

  /**
   * Retrieves an accumulated list of warning strings or tool failures encountered during execution.
   *
   * @returns An array of string error descriptions.
   */
  get limitations(): string[] {
    return [...this.failures];
  }

  /**
   * Invokes a backend tool safely with configured budgets, failure safety caps, and error logging.
   *
   * @template TArgs - Type structure of the parameters passed to the tool.
   * @template TResult - Expected type structure of the output payload.
   * @param toolId - The stable path identification string for the system tool.
   * @param args - Arguments needed to fulfill the tool's runtime validation requirements.
   * @returns A Promise resolving to the tool result wrapper, or undefined if skipped or failed.
   */
  async invoke<TArgs, TResult>(
    toolId: string,
    args: TArgs
  ): Promise<ToolInvocationResult<TResult> | undefined> {
    if (this.calls >= this.options.maxInvocations) {
      this.failures.push(`Tool '${toolId}' was skipped: handover tool budget exhausted.`);
      return undefined;
    }

    this.calls++;

    try {
      return await this.context.invokeTool<TArgs, TResult>({
        toolId,
        args,
        limits: { timeoutMs: this.options.timeoutMs ?? 10_000 },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      this.failures.push(`Tool '${toolId}' failed: ${message}`);
      this.context.logger.warn(`Handover tool '${toolId}' failed`, { error: message });

      return undefined;
    }
  }
}
