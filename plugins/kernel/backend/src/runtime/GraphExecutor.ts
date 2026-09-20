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

import type {
  AgentDefinition,
  AgentEvent,
  WorkflowDefinition,
} from '@ai-crew-suite/plugin-kernel-node';
import {
  validateWorkflowDefinition,
  END,
  type EndSymbol,
  NodeError,
  type Redactor,
} from '@ai-crew-suite/plugin-kernel-node';
import { NodeHarness } from './NodeHarness';
import type { EventMapper } from './EventMapper';
import type { ToolExecutor } from './ToolExecutor';
import type { ModelExecutor } from './ModelExecutor';
import type { LangGraphCheckpointer } from './LangGraphCheckpointer';

/** Typed definition map passed by factory. */
export type WorkflowDefinitionMap = Map<string, WorkflowDefinition>;

/**
 * The single execution engine for AI Core. Compiles WorkflowDefinitions into
 * executable graphs once per workflow; validates definitions at boot; runs
 * sequences of nodes with checkpointing on the LangGraph checkpointer.
 */
export class GraphExecutor {
  constructor(
    private readonly definitions: WorkflowDefinitionMap,
    private readonly checkpointer: LangGraphCheckpointer,
    private readonly eventMapper: EventMapper,
    private readonly toolRegistry: unknown,
    private readonly models: Map<string, unknown>,
    private readonly tiers: Record<string, string>,
    private readonly auditLogSink?: unknown,
    private readonly redactor?: Redactor,
  ) {
    // Boot-time validation: every registered definition must validate
    for (const [id, def] of definitions.entries()) {
      const violations = validateWorkflowDefinition(def);
      if (violations.length > 0) {
        throw new NodeError(
          `Workflow definition '${id}' failed validation: ${violations.map(v => v.message).join('; ')}`,
          'invalid_input',
        );
      }
    }
  }

  /** Resolve a workflow definition by ID. Throws at boot if unknown. */
  resolveDefinition(id: string): WorkflowDefinition {
    const def = this.definitions.get(id);
    if (!def) {
      throw new NodeError(`Unknown workflow definition '${id}'`, 'invalid_input');
    }
    return def;
  }

  /** Run agents/workflows to produce AgentEvent stream. */
  async *run(
    agent: AgentDefinition,
    input: { runId: string; query: string; source: string; entityFilter?: unknown; sessionId?: string },
    ctx: {
      toolExecutorFactory: (nodeName: string) => ToolExecutor;
      modelExecutorFactory: () => ModelExecutor;
      checkpointStore?: unknown;
    },
  ): AsyncIterable<AgentEvent> {
    const def = this.resolveDefinition(agent.workflowRef);
    const parsedInput = def.inputSchema.parse(input as never);
    let state = def.state.schema.parse({} as never) as unknown;

    const emit = (event: AgentEvent) => {
      events.push(event);
    };

    const events: AgentEvent[] = [];
    const mapper = this.eventMapper;
    const redactor = this.redactor;
    let current: string | EndSymbol = def.entryNode;
    const visited = new Set<string>();

    while (current !== END) {
      const nodeName = current as string;
      const node = def.nodes[nodeName];
      if (!node) {
        throw new NodeError(`Node '${nodeName}' missing in workflow '${def.id}'`, 'unknown');
      }

      // Interrupt gate (auto-approve in engine unless a decision handler is provided)
      const interrupt = def.interrupts?.find(i => i.beforeNode === nodeName);
      if (interrupt && !visited.has(nodeName)) {
        const approval = interrupt.approvalRequest(state as never);
        emit(mapper.approvalRequest(input.runId, `approval-${nodeName}`, nodeName, approval.reason, approval.effect));
      }

      emit(mapper.step(input.runId, nodeName, 'enter'));

      // Invoke the node with the harness
      const harness = new NodeHarness(def.state.schema as never, {}, redactor);
      const wrapped = harness.wrap(node as never);
      const patch = await wrapped({ state, input: parsedInput, ctx: {
        logger: undefined as never,
        tools: ctx.toolExecutorFactory(nodeName) as never,
        model: ctx.modelExecutorFactory() as never,
        emitArtifact: async (kind, payload) => {
          emit(mapper.artifact(input.runId, kind, payload.ref, payload.url));
        },
        now: () => new Date(),
        signal: new AbortController().signal,
      } });

      // Apply the patch
      state = def.state.schema.parse({ ...(state as object), ...(patch as object) }) as unknown;
      visited.add(nodeName);

      // Checkpoint on the store
      if (this.checkpointer) {
        await (this.checkpointer as { put: (rec: unknown) => Promise<void> }).put({
          runId: input.runId,
          seq: events.length,
          nextNode: nodeName,
          state,
          stateVersion: def.state.stateVersion,
          createdAt: new Date().toISOString(),
        });
      }

      // Resolve next node
      const edge = def.edges.find(e => e.from === nodeName && 'to' in e) ?? def.edges.find(e => e.from === nodeName && 'route' in e);
      if (!edge) {
        current = END;
      } else if ('to' in edge) {
        current = edge.to;
      } else {
        current = edge.route(state as never);
      }
      emit(mapper.step(input.runId, nodeName, 'exit'));
    }

    emit(mapper.done(input.runId, input.sessionId));
    for (const event of events) {
      yield event;
    }
  }
}
