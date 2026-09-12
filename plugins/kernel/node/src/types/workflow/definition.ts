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
import type { ZodType } from 'zod';
import type { ApprovalDecision } from '../storage/runtime';
import type { NodeExecutionContext } from './execution';
import { ValidationRule } from './validationRules';

/**
 * ============================================================================
 *   MACRO GRAPH BLUEPRINT CONTRACT
 * ============================================================================
 */

/**
 * A declarative domain workflow graph registered by an agent plugin.
 *
 * The executor owns sequencing, checkpointing, interrupts, and tool/model dispatch.
 * The plugin owns domain logic: node functions, edge predicates, state schema, prompts.
 */
export type WorkflowDefinition<TState = unknown, TInput = unknown> = {
  /** Stable ID referenced by `AgentDefinition.workflowRef`. */
  id: string;
  /** Zod schema for the run's structured input. Validated by the executor. */
  inputSchema: ZodType<TInput>;
  state: WorkflowStateSchema<TState>;
  entryNode: string;
  nodes: Record<string, WorkflowNode<TState, TInput>>;
  edges: WorkflowEdge<TState>[];
  interrupts?: WorkflowInterrupt<TState>[];
  /** Artifact kinds this workflow may emit; the executor validates emissions. */
  artifactKinds: readonly string[];
  /**
   * Dynamic structural validation rules contributed by external plugins
   * via Backstage Extension Points. Evaluated pre-flight.
   */
  customRules?: ValidationRule[];
};

/**
 * ============================================================================
 *   VERTEX (NODE) & EDGE DEFINITIONS
 * ============================================================================
 */

/** Input handed to every vertex node function. */
export type WorkflowNodeInput<TState, TInput> = {
  /** Current Zod-validated workflow state. */
  state: TState;
  /** Zod-validated run input. */
  input: TInput;
  /** Core-provided node execution facade. */
  ctx: NodeExecutionContext;
};

/**
 * A node is a pure-ish async function: state in, partial state patch out.
 * Routing is never decided inside a node; nodes only write state through typed channels.
 */
export type WorkflowNode<TState, TInput> = (
  node: WorkflowNodeInput<TState, TInput>,
) => Promise<Partial<TState>>;

/** Terminal sentinel returned by a conditional edge `route` to end the workflow. */
export const END: unique symbol = Symbol('ai-workflow-end');
export type EndSymbol = typeof END;

/**
 * An edge is either static (`to`) or a deterministic predicate (`route`) returning the
 * destination node ID or `END`. Predicates are pure and evaluated by the executor.
 */
export type WorkflowEdge<TState> =
  | { from: string; to: string }

  | { from: string; route: (state: TState) => string | EndSymbol };

/**
 * ============================================================================
 *   STATE CHANNEL SCHEMA BOUNDARIES
 * ============================================================================
 */

/**
 * Zod-validated state channels. Each key maps to a reducer; default is last-write-wins.
 */
export type WorkflowStateSchema<TState> = {
  /** Zod object schema; validated at every checkpoint boundary. */
  schema: ZodType<TState>;
  /** Per-channel reducers; default is last-write-wins. */
  reducers?: { [K in keyof TState]?: (prev: TState[K], next: TState[K]) => TState[K] };
  /** Bump when the shape changes; the executor refuses to resume older versions. */
  stateVersion: number;
};

/**
 * ============================================================================
 *   4HUMAN-IN-THE-LOOP (HITL) INTERRUPTS
 * ============================================================================
 */

/**
 * A declarative approval gate. The executor parks the graph before `beforeNode`,
 * emits an `approval_request` built by `approvalRequest`, and on decision applies
 * `applyDecision` to produce a state patch before resuming.
 */
export type WorkflowInterrupt<TState> = {
  /** Interrupt before this node executes. */
  beforeNode: string;
  /** Builds the approval payload from frozen state; pure. */
  approvalRequest: (state: TState) => { reason: string; effect: 'write' };
  /** Maps the human decision back into state; pure. */
  applyDecision: (state: TState, decision: ApprovalDecision) => Partial<TState>;
};
