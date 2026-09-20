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
  WorkflowContext
} from '@ai-crew-suite/plugin-kernel-node';

/**
 * Bounded, failure-tolerant facade for the tuner's read-only tool calls.
 *
 * An optional source being unavailable must degrade the proposal rather than
 * abort the run, so every failure is recorded as a limitation and returns
 * `undefined` instead of throwing.
 */
export class TunerToolRunner {
  private calls = 0;
  private readonly failures: string[] = [];
  private readonly unavailable = new Set<string>();

  /**
   * @param context - Workflow context supplying the allow-listed tool facade.
   * @param options - Invocation budget and per-call timeout.
   */
  constructor(
    private readonly context: WorkflowContext,
    private readonly options: { maxInvocations: number; timeoutMs?: number }
  ) {}

  /** Limitations accumulated when a bounded read tool could not complete. */
  get limitations(): string[] {
    return [...this.failures];
  }

  /**
   * Reports whether a tool failed or was skipped during this run, so callers can
   * cap confidence without re-inspecting limitation strings.
   */
  missing(toolId: string): boolean {
    return this.unavailable.has(toolId);
  }

  /**
   * Invokes an allow-listed read tool within the run's shared budget.
   *
   * @param toolId - Registered tool identifier.
   * @param args - Tool arguments matching the registered contract.
   * @returns The tool result, or `undefined` when skipped or failed.
   */
  async invoke<TArgs, TResult>(
    toolId: string,
    args: TArgs
  ): Promise<ToolInvocationResult<TResult> | undefined> {
    if (this.calls >= this.options.maxInvocations) {
      this.unavailable.add(toolId);
      this.failures.push(`Tool '${toolId}' was skipped: alert tuning tool budget exhausted.`);
      return undefined;
    }

    this.calls += 1;

    try {
      return await this.context.invokeTool<TArgs, TResult>({
        toolId,
        args,
        limits: { timeoutMs: this.options.timeoutMs ?? 10_000 },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      this.unavailable.add(toolId);
      this.failures.push(`Tool '${toolId}' is unavailable: ${message}`);
      this.context.logger.warn(`Alert tuning tool '${toolId}' failed`, { error: message });

      return undefined;
    }
  }
}
