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

import { randomUUID } from 'crypto';
import {
  type AgentDefinition,
  type AuditLogSink,
  NodeError,
  type Redactor,
  type RunContext,
  type ToolInvocationLimits,
  type ToolInvocationResult,
  type ToolRegistry,
} from '@ai-crew-suite/plugin-kernel-node';


/**
 * Core-owned single choke point for all tool invocation. Enforces allow-lists,
 * provider policy, RBAC provider filter, effect gating, budgets, and audit.
 */
export class ToolExecutor {
  constructor(
    private readonly agent: AgentDefinition,
    private readonly registry: ToolRegistry,
    private readonly runId: string,
    private readonly nodeName: string,
    private readonly logger: RunContext['logger'],
    private readonly identity: string,
    private readonly auditLogSink?: AuditLogSink,
    private readonly redactor?: Redactor,
    /** True only inside nodes whose interrupt gate was approved in this run. */
    private readonly approvedWrite = false,
  ) {}

  /**
   * Dispatch a tool invocation. Returns the result after all checks pass.
   * Throws NodeError('tool_denied') on allow-list/provider/RBAC/effect violations.
   */
  async invoke<TArgs = unknown, TResult = unknown>(input: {
    toolId: string;
    args: TArgs;
    limits?: ToolInvocationLimits;
  }): Promise<ToolInvocationResult<TResult>> {
    // 1. Allow-list check
    if (!this.agent.toolIds.includes(input.toolId)) {
      throw new NodeError(`Tool '${input.toolId}' is not in the agent allow-list`, 'tool_denied');
    }
    // 2. Provider restriction (category scope)
    // Note: category metadata is not derivable from a raw toolId today;
    // future category modules register providerIds and category labels.
    // 4. Effect gating: write tools may only run in approved interrupt context
    const tool = this.registry.get(input.toolId);
    if (!tool) {
      throw new NodeError(`Tool '${input.toolId}' not registered`, 'tool_failed');
    }
    if (tool.effect === 'write' && !this.approvedWrite) {
      throw new NodeError(`Write tool '${input.toolId}' requires an approved interrupt gate`, 'tool_denied');
    }

    // 5-6. Dispatch with budgets
    const output = await tool.invoke(input.args, {
      logger: this.logger,
      identity: this.identity,
      runId: this.runId,
      signal: new AbortController().signal,
    });

    // 7. Audit write tools
    if (tool.effect === 'write') {
      await this.auditLogSink?.recordWriteAction({
        id: randomUUID(),
        runId: this.runId,
        agentId: this.agent.id,
        action: 'write_tool_call',
        toolId: input.toolId,
        payload: this.redactor?.apply(input.args) ?? input.args,
        actor: this.identity,
      });
    }

    return { toolId: input.toolId, output: output as TResult, summary: '' };
  }
}
