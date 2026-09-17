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
import { LoggerService } from '@backstage/backend-plugin-api';
import { AugmentationIndexer, RetrievalPipeline } from '../pipelines';

/**
 * ============================================================================
 *   CORE EXECUTABLE CONTRACTS
 * ============================================================================
 */

/**
 * Executable tool that can be invoked by an agent or orchestration pipeline.
 */
export interface Tool<A = unknown, R = unknown> {
  /** Unique tool identifier used by agent definitions and events. */
  readonly id: string;
  /** Human-readable summary of the tool's behavior. */
  readonly description?: string;
  /** The parent architectural category envelope grouping this capability module. */
  readonly category: ToolCategory;
  /** Optional input schema understood by clients or validation layers. */
  readonly schema?: unknown;
  /** Declares whether the tool only reads data or may modify external systems. */
  readonly effect?: 'read' | 'write';
  /** Executes the tool with caller-provided arguments and runtime context. */
  invoke: (args: A, ctx: ToolContext) => Promise<R>;
}

/**
 * Tool registration shape used by backend modules.
 * Extends the baseline tool execution contract with optional context-augmentation capabilities.
 */
export type ToolDefinition = Tool & {
  /** Optional indexer exposed by this tool for embedding creation and deletion. */
  augmentationIndexer?: AugmentationIndexer;
  /** Optional retrieval pipeline exposed by this tool for augmentation lookups. */
  retrievalPipeline?: RetrievalPipeline;
};

export type ToolMap = Map<string, ToolDefinition>;

/**
 * ============================================================================
 *   CORE ENGINE REGISTRIES
 * ============================================================================
 */

/**
 * Registry of tools available to orchestrators and agents.
 */
export interface ToolRegistry {
  /** Adds a tool to the registry. Implementations should reject duplicate IDs. */
  register(tool: Tool): void;
  /** Returns a tool by ID, or `undefined` when it is not registered. */
  get(id: string): Tool | undefined;
  /** Returns all registered tools in registry order. */
  list(): Tool[];
}

/**
 * ============================================================================
 *   RUNTIME EXECUTION CONTEXTS
 * ============================================================================
 */

/**
 * Runtime context provided to a tool invocation.
 */
export type ToolContext = {
  /** Optional credentials object supplied by the caller or host integration. */
  credentials?: unknown;
  /** Optional auth helper supplied by the host application. */
  auth?: unknown;
  /** Optional discovery helper supplied by the host application. */
  discovery?: unknown;
  /** Logger scoped to the current backend runtime. */
  logger: LoggerService;
  /** Identity ref or label for the actor that started the run. */
  identity: string;
  /** Run identifier used for tracing and audit correlation. */
  runId: string;
  /** Abort signal that tools should observe for cancellation and timeout handling. */
  signal: AbortSignal;
};

/**
 * Shared limits enforced for a single workflow tool invocation.
 */
export type ToolInvocationLimits = {
  /** Maximum time spent waiting for one tool invocation. */
  timeoutMs?: number;
  /** Maximum number of tool calls a workflow may make in one run. */
  maxInvocations?: number;
};

/**
 * Result returned to a workflow after AI Core invokes an allow-listed tool.
 */
export type ToolInvocationResult<TResult = unknown> = {
  toolId: string;
  output: TResult;
  /** Redacted compact summary appropriate for events and persisted run steps. */
  summary: string;
};
