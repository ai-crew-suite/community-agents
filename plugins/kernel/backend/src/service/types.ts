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
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type {
  LoggerService,
  RootConfigService,
} from '@backstage/backend-plugin-api';
import type {
  AgentDefinition,
  AgentsMap,
  ArtifactSink,
  AuditLogSink,
  AugmentationIndexer,
  CheckpointStore,
  RetrievalPipeline,
  RunStore,
  SessionStore,
  SourceRegistry,
  ToolMap,
  ToolRegistry,
  TriggerBinding,
  WorkflowDefinitionMap,
} from '@ai-crew-suite/plugin-kernel-node';
import type { AgentRuntime } from '../runtime';
import type { WorkflowController } from '../api/controller';
import type { AiBackendConfig } from '../types';

export type ModelRegistry = Map<string, BaseChatModel>;

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
