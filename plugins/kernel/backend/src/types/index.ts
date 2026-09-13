/*
 * Copyright 2024 Larder Software Limited
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
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type {
  LoggerService,
  RootConfigService,
} from '@backstage/backend-plugin-api';
import type {
  AgentDefinition,
  AgentEvent,
  ArtifactSink,
  AuditLogSink,
  AugmentationIndexer,
  CheckpointStore,
  EmbeddingsSource,
  RetrievalPipeline,
  RunStore,
  SessionStore,
  SourceRegistry,
  ToolDefinition,
  ToolRegistry,
  TriggerBinding,
  WorkflowDefinition,
} from '@ai-crew-suite/plugin-kernel-node';
import type { AgentRuntime } from '../runtime';
import type { WorkflowController } from '../service/controller';

/**
 * Plugin configuration for the `ai` root config section.
 */
export type AiBackendConfig = {
  /** Per-agent execution settings keyed by agent ID. */
  agents?: Record<
    string,
    {
      /** Model override for this agent. */
      model?: string;
      /** System prompt override for this agent. */
      systemPrompt?: string;
      /** Registered domain workflow definition ID. */
      workflow?: string;
      /** Tool IDs that this agent is allowed to use. */
      tools?: string[];
      /** Memory mode for this agent. */
      memory?: 'none' | 'session';
      /** Per-category provider allow-list override for this agent. */
      providers?: Record<string, readonly string[]>;
      /** Per-agent guardrail enforcement. */
      guardrails?: { input?: boolean; output?: boolean };
    }
  >;
  /** Optional model tier map (tier name -> model registry ID). */
  models?: {
    tiers?: Record<string, string>;
  };
  /** Approval authorizer implementation. */
  approval?: {
    authorizer?: 'default' | 'compliance';
  };
  /** Prompt wrappers applied to generated execution prompts. */
  prompts?: {
    prefix: string;
    suffix: string;
  };
  /** Redaction policy overrides. */
  redaction?: {
    keyPatterns?: string[];
    valuePatterns?: string[];
    mode?: 'redact' | 'reject';
  };
  /** Allowed retrieval source IDs. */
  supportedSources?: string[];
  /** Runtime hardening limits. */
  hardening?: {
    timeoutMs?: number;
    maxRetries?: number;
    retryBackoffMs?: number;
    maxTotalTokens?: number;
    maxNodeDurationMs?: number;
    rateLimitPerMinute?: number;
  };
};

export type AgentsMap = Map<string, AgentDefinition>;
export type ModelRegistry = Map<string, BaseChatModel>;
export type ToolMap = Map<string, ToolDefinition>;
export type WorkflowDefinitionMap = Map<string, WorkflowDefinition>;

/** Raw dependency bundle used to assemble AI backend runtime services. */
export interface AiBackendServiceOptions {
  agents: AgentsMap;
  artifactSink?: ArtifactSink;
  auditLogSink?: AuditLogSink;
  checkpointStore?: CheckpointStore;
  config: RootConfigService;
  logger: LoggerService;
  models: ModelRegistry;
  runStore?: RunStore;
  sessionStore?: SessionStore;
  sourceRegistry: SourceRegistry;
  tools: ToolMap;
  workflowDefinitions?: WorkflowDefinitionMap;
  triggers?: TriggerBinding[];
}

/** Resolved service bundle returned by the backend composition factory. */
export interface AiBackendServices {
  aiBackendConfig?: AiBackendConfig;
  sourceRegistry: SourceRegistry;
  agents: Map<string, AgentDefinition>;
  augmentationIndexer: AugmentationIndexer;
  retrievalPipeline: RetrievalPipeline;
  toolRegistry: ToolRegistry;
  runtime: AgentRuntime;
  controller: WorkflowController;
}

/** Fully resolved dependencies required to bind the HTTP router. */
export interface RouterOptions extends AiBackendServiceOptions {
  augmentationIndexer: AugmentationIndexer;
  retrievalPipeline: RetrievalPipeline;
}

/** Minimal controller surface needed by the router binder. */
export type RouteController = Pick<
  WorkflowController,
  | 'createEmbeddings'
  | 'deleteEmbeddings'
  | 'getEmbeddings'
  | 'listAgents'
  | 'startRun'
  | 'streamRunEvents'
  | 'approveRun'
  | 'triggerRun'
  | 'webhookRun'
>;

/** Narrow route-binding contract for the express router. */
export interface CreateRouterOptions {
  logger: LoggerService;
  config: RootConfigService;
  sourceRegistry: SourceRegistry;
  controller: RouteController;
}

/** Normalized token accounting captured from model stream chunks. */
export type UsageMetadata = {
  total_tokens: number;
  output_tokens: number;
  input_tokens: number;
};

export type HardeningOptions = {
  timeoutMs?: number;
  maxRetries?: number;
  retryBackoffMs?: number;
  maxTotalTokens?: number;
  maxNodeDurationMs?: number;
  rateLimitPerMinute?: number;
};

/**
 * ============================================================================
 *   New Types
 * ============================================================================
 */

export interface ControllerContext {
  logger: LoggerService;
  augmentationIndexer: AugmentationIndexer;
  retrievalPipeline?: RetrievalPipeline;
  runStore?: RunStore;
  agents: Map<string, AgentDefinition>;
  validateSource: (source: string | undefined) => EmbeddingsSource;
  consumeRateLimit: (agentId: string) => boolean;
  parseLastEventId: (value?: string) => number;
  fromStoredStep: (type: string, payload: unknown) => AgentEvent | undefined;
}
