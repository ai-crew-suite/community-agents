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
 * Shared bounded read-tool executor for both parallel review channels.
 * Wraps tool invocations in safety caps to ensure error isolation across separate analysis steps.
 */
export class ReviewToolRunner {
  private invocations = 0;
  private readonly failures: string[] = [];

  /**
   * Creates an instance of ReviewToolRunner.
   *
   * @param context - The centralized execution framework workflow context.
   * @param maxInvocations - Hard budget constraint tracking maximum allowed tool calls.
   */
  constructor(
    private readonly context: WorkflowContext,
    private readonly maxInvocations: number
  ) {}

  /**
   * Limitations accumulated when a bounded read tool cannot complete.
   *
   * @returns An isolated array of error or budget warning descriptions.
   */
  get limitations(): string[] {
    return [...this.failures];
  }

  /**
   * Invokes an allow-listed read tool without allowing one failed channel to abort the other.
   * Keeps track of limits and registers soft failures into the local warnings stack.
   *
   * @template TArgs - Typings mapping parameter keys passed downstream.
   * @template TResult - Typings outlining expected data payload schema shapes.
   * @param toolId - The stable string path key identifying the framework action.
   * @param args - Structural params required to fulfill tool execution parameters.
   * @returns A Promise resolving to the tool result wrapper, or undefined if skipped/failed.
   */
  async invoke<TArgs, TResult>(
    toolId: string,
    args: TArgs
  ): Promise<ToolInvocationResult<TResult> | undefined> {
    if (this.invocations >= this.maxInvocations) {
      this.failures.push(`Tool '${toolId}' was skipped: RFC/ADR review tool budget exhausted.`);
      return undefined;
    }

    this.invocations += 1;

    try {
      return await this.context.invokeTool<TArgs, TResult>({
        toolId,
        args,
        limits: { timeoutMs: 10_000 },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      this.failures.push(`Tool '${toolId}' failed: ${message}`);
      this.context.logger.warn(`RFC/ADR review tool '${toolId}' failed`, { error: message });

      return undefined;
    }
  }
}
