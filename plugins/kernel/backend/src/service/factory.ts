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
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type {
  AgentDefinition,
  HardeningOptions,
  SourceRegistry,
  ToolMap,
  WorkflowDefinition,
} from '@ai-crew-suite/plugin-kernel-node';
import type { AiBackendServiceOptions, AiBackendServices } from './types';
import type { AiBackendConfig } from '../types';
import { AgentRuntime } from '../runtime/AgentRuntime';
import { GraphExecutor } from '../runtime/GraphExecutor';

/**
 * Creates a mutable in-memory source registry used during backend assembly.
 */
export const createSourceRegistry = (): SourceRegistry => {
  const sources = new Map<string, { id: string; description?: string }>();
  return {
    register(source) {
      sources.set(source.id, source);
    },
    list() {
      return [...sources.values()];
    },
    has(id) {
      return sources.has(id);
    },
  };
};

function resolveSourceRegistry(
  sourceRegistry: SourceRegistry,
  _config: AiBackendServiceOptions['config'],
  logger: LoggerService
): SourceRegistry {
  const sources = sourceRegistry.list();
  if (sources.length === 0) {
    logger.warn('No sources registered for the AI backend');
  }
  return sourceRegistry;
}

/**
 * Fully typed boot-time safeguard validating structural alignment of system components.
 */
function validateResolvedAgents(
  agents: Map<string, AgentDefinition>, 
  models: Map<string, BaseChatModel>, 
  workflows: Map<string, WorkflowDefinition>, 
  tools: ToolMap
): void {
  for (const agent of agents.values()) {
    if (!models.has(agent.modelRef)) {
      throw new Error(`Agent '${agent.id}' references unknown model registry entity key '${agent.modelRef}'`);
    }
    if (agent.workflowRef && !workflows.has(agent.workflowRef)) {
      throw new Error(`Agent '${agent.id}' references unknown workflow runner definition handle '${agent.workflowRef}'`);
    }
    for (const toolId of agent.toolIds) {
      if (!tools.has(toolId)) {
        throw new Error(`Agent '${agent.id}' references unknown registered capability tool '${toolId}'`);
      }
    }
  }
}

/**
 * Outputs a clean Dependency Graph Injection Payload. This payload passes strongly
 * typed registries, stores, and runtimes directly to the declarative router so it
 * can distribute them to individual command subclasses.
 */
export function createAiBackendServices(
  options: AiBackendServiceOptions,
): AiBackendServices {
  const {
    logger,
    sourceRegistry,
    agents,
    tools,
    workflowDefinitions = new Map(),
    models,
    sessionStore,
    checkpointStore,
    runStore,
    artifactSink,
    auditLogSink,
    triggers,
    config,
  } = options;

  const aiBackendConfig = config.getOptional<AiBackendConfig>('ai');
  const resolvedSourceRegistry = resolveSourceRegistry(sourceRegistry, config, logger);

  if (agents.size === 0) {
    logger.warn('No agents registered at AI backend factory');
  }

  // Enforce rigid enterprise boot firewalls
  validateResolvedAgents(agents, models, workflowDefinitions, tools);

  // Initialize pure runtime layers with explicit internal engines
  const runtime = new AgentRuntime(
    agents,
    new GraphExecutor(
      workflowDefinitions,
      null as never, // These remain bound tightly to internal LangGraph lifecycles inside runtime/
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
    ),
  );

  // Return a clean dependency bag directly to plugin.ts
  return {
    aiBackendConfig,
    sourceRegistry: resolvedSourceRegistry,
    agents,
    runtime,
    // Pluggable compliance infrastructure stores passed cleanly forward without controller packaging
    sessionStore,
    checkpointStore,
    runStore,
    artifactSink,
    auditLogSink,
    triggers: triggers ?? [],
    hardeningOptions: toHardeningOptions(aiBackendConfig),
  };
}

function toHardeningOptions(aiBackendConfig?: AiBackendConfig): HardeningOptions {
  return {
    timeoutMs: aiBackendConfig?.hardening?.timeoutMs,
    maxRetries: aiBackendConfig?.hardening?.maxRetries,
    retryBackoffMs: aiBackendConfig?.hardening?.retryBackoffMs,
    maxTotalTokens: aiBackendConfig?.hardening?.maxTotalTokens,
    maxNodeDurationMs: aiBackendConfig?.hardening?.maxNodeDurationMs,
    rateLimitPerMinute: aiBackendConfig?.hardening?.rateLimitPerMinute,
  };
}
