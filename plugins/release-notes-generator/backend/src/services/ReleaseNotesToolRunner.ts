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

/** Bounded, failure-tolerant facade over the AI Core tool executor. */
export class ReleaseNotesToolRunner {
  private invocations = 0;
  private readonly failures: string[] = [];

  constructor(
    private readonly context: WorkflowContext,
    private readonly maxInvocations: number,
  ) {}

  /** Human-readable limitations accumulated from unavailable or failed read tools. */
  get limitations(): string[] {
    return [...this.failures];
  }

  /** Invokes an allow-listed read tool, returning undefined instead of aborting on failure. */
  async invoke<TArgs, TResult>(toolId: string, args: TArgs): Promise<ToolInvocationResult<TResult> | undefined> {
    if (this.invocations >= this.maxInvocations) {
      this.failures.push(`Tool '${toolId}' was skipped: release-notes tool budget exhausted.`);
      return undefined;
    }
    this.invocations += 1;
    try {
      return await this.context.invokeTool<TArgs, TResult>({ toolId, args, limits: { timeoutMs: 10_000 } });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.failures.push(`Tool '${toolId}' failed: ${message}`);
      this.context.logger.warn(`Release-notes tool '${toolId}' failed`, { error: message });
      return undefined;
    }
  }
}
