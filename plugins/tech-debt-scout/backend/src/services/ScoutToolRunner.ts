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

/** Bounded, failure-tolerant facade for scout read tools. */
export class ScoutToolRunner {
  private calls = 0;
  private readonly failures: string[] = [];

  constructor(
    private readonly context: WorkflowContext,
    private readonly maxCalls: number,
  ) {}

  /** Limitations accumulated from missing sources or exhausted budgets. */ get limitations(): string[] {
    return [...this.failures];
  }

  /** Invokes one allow-listed tool and degrades failures into an explicit limitation. */ async invoke<
    TArgs,
    TResult,
  >(
    toolId: string,
    args: TArgs,
  ): Promise<ToolInvocationResult<TResult> | undefined> {
    if (this.calls >= this.maxCalls) {
      this.failures.push(
        `Tool '${toolId}' was skipped: scout tool budget exhausted.`,
      );
      return undefined;
    }

    this.calls += 1;

    try {
      return await this.context.invokeTool<TArgs, TResult>({
        toolId,
        args,
        limits: { timeoutMs: 10_000 },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      this.failures.push(`Tool '${toolId}' is unavailable: ${message}`);
      this.context.logger.warn(`Tech debt scout tool '${toolId}' failed`, {
        error: message,
      });

      return undefined;
    }
  }
}
