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
import type { AgentEvent } from '../types/agents';
import type { WorkflowDefinition } from '../types/workflow/definition';
import { type EndSymbol, END } from '../types/workflow/definition';
import type { NodeExecutionContext } from '../types/workflow/execution';
import { NodeError } from '../workflow/errors';
import { validateWorkflowDefinition } from '../workflow/validation/definition';

export interface WorkflowRunResult<TState> {
  events: AgentEvent[];
  finalState: TState;
}

export interface TestWorkflowRunOptions {
  maxIterations?: number;
}

class WorkflowTestExecutor<TState, TInput> {
  private events: AgentEvent[] = [];
  private visitedNodes = new Set<string>();
  private sequenceId = 0;
  private currentPointer: string | EndSymbol;
  private workflowState: TState;
  private parsedInput: TInput;
  private executionStepsCounter = 0;
  private readonly runId = 'test-run';

  constructor(
    private readonly def: WorkflowDefinition<TState, TInput>,
    rawInput: TInput,
    private readonly ctx: NodeExecutionContext,
    private readonly maxIterations: number
  ) {
    // FIX (2554): Restored to a single argument signature matching your local function type footprint
    const structuralViolations = validateWorkflowDefinition(def);
    if (structuralViolations.length > 0) {
      // FIX (2532): Added safe optional chaining access guard fallback string
      const failureMsg = structuralViolations[0]?.message ?? 'Unknown validation failure';
      throw new NodeError(
        `Static workflow definition failed structural rules verification: ${failureMsg}`,
        'unknown'
      );
    }

    this.parsedInput = def.inputSchema.parse(rawInput);
    this.currentPointer = def.entryNode;
    this.workflowState = this.initializeDefaultState(rawInput);
  }

  public async execute(): Promise<WorkflowRunResult<TState>> {
    while (this.currentPointer !== END) {
      this.enforceLoopBoundsGuard();
      const nodeName = this.currentPointer as string;
      this.evaluateInterruptGate(nodeName);
      await this.processNodeExecutionStep(nodeName);
      this.currentPointer = this.resolveNextTrajectory(nodeName);
    }
    this.emitEvent({ type: 'done', data: { runId: this.runId } });
    return { events: this.events, finalState: this.workflowState };
  }

  private initializeDefaultState(rawInput: TInput): TState {
    const defaultCheck = this.def.state.schema.safeParse({});
    return this.def.state.schema.parse(
      defaultCheck.success ? {} : { ...Object(rawInput) }
    ) as TState;
  }

  private enforceLoopBoundsGuard(): void {
    this.executionStepsCounter += 1;
    if (this.executionStepsCounter > this.maxIterations) {
      throw new NodeError(
        `Workflow testing iteration limit exceeded (${this.maxIterations} steps). Possible infinite loop cycle detected inside workflow: '${this.def.id}'`,
        'unknown'
      );
    }
  }

  private evaluateInterruptGate(nodeName: string): void {
    if (this.visitedNodes.has(nodeName)) return;
    const interrupt = this.def.interrupts?.find(i => i.beforeNode === nodeName);
    if (!interrupt) return;

    const approval = interrupt.approvalRequest(this.workflowState);
    this.emitEvent({
      type: 'approval_request',
      data: {
        runId: this.runId,
        approvalId: `test-approval-${nodeName}`,
        node: nodeName,
        reason: approval.reason,
        effect: approval.effect
      },
    });
  }

  private async processNodeExecutionStep(nodeName: string): Promise<void> {
    const nodeAction = this.def.nodes[nodeName];
    if (!nodeAction) {
      throw new NodeError(`Node '${nodeName}' missing in workflow definition: '${this.def.id}'`, 'unknown');
    }

    this.emitStepLifecycleEvent(nodeName, 'enter');
    const patch = await nodeAction({ state: this.workflowState, input: this.parsedInput, ctx: this.ctx });
    this.applyStatePatch(patch);
    this.visitedNodes.add(nodeName);
    this.emitStepLifecycleEvent(nodeName, 'exit');
  }

  private applyStatePatch(patch: Partial<TState>): void {
    this.workflowState = this.def.state.schema.parse({
      ...(this.workflowState as object),
      ...(patch as object)
    }) as TState;
  }

  private resolveNextTrajectory(nodeName: string): string | EndSymbol {
    const currentEdges = (this.def.edges || []).filter(e => e.from === nodeName);
    const targetEdge = currentEdges.find(e => 'to' in e) ?? currentEdges.find(e => 'route' in e);
    if (!targetEdge) return END;
    return 'to' in targetEdge ? targetEdge.to : targetEdge.route(this.workflowState);
  }

  private emitStepLifecycleEvent(node: string, phase: 'enter' | 'exit'): void {
    this.emitEvent({
      type: 'step',
      data: { runId: this.runId, seq: this.sequenceId, node, phase }
    });
  }

  private emitEvent(event: AgentEvent): void {
    this.sequenceId += 1;
    if (event.type === 'step' && event.data) {
      event.data.seq = this.sequenceId;
    }
    this.events.push(event);
  }
}

export async function runWorkflow<TState, TInput>(
  def: WorkflowDefinition<TState, TInput>,
  rawInput: TInput,
  ctx: NodeExecutionContext,
  options?: TestWorkflowRunOptions | number,
): Promise<WorkflowRunResult<TState>> {
  const resolvedMaxIterations = typeof options === 'number' ? options : (options?.maxIterations ?? 100);
  return new WorkflowTestExecutor(def, rawInput, ctx, resolvedMaxIterations).execute();
}
