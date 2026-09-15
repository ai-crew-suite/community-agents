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
import { createExtensionPoint } from '@backstage/backend-plugin-api';
import {
  AgentDefinition,
  ArtifactSink,
  AuditLogSink,
  ChatModelDefinition,
  CheckpointStore,
  EmbeddingsDefinition,
  GuardrailDefinition,
  RerankingDefinition,
  RunStore,
  SessionStore,
  SourceDescriptor,
  StateSerializer,
  ToolDefinition,
  TranscriptionDefinition,
  TriggerBinding,
  UsageSink,
  VectorStoreDefinition,
  WorkflowDefinition,
} from './types';

export * from './tools';

/**
 * Extension point for registering executable agent profiles.
 */
export interface AgentExtensionPoint {
  addAgent(agent: AgentDefinition): void;
}

export const agentExtensionPoint = createExtensionPoint<AgentExtensionPoint>({
  id: 'plugin-agent.agents',
});

/**
 * Extension point that allows backend modules to register indexing and retrieval sources
 * (e.g., `catalog`, `techdocs`, or custom third-party integrations) with the central AI agent runtime.
 *
 * Registered sources provide the content pipelines utilized by agentic workflow plugins
 * for embeddings generation, knowledge indexing, and context-aware retrieval.
 */
export interface SourceExtensionPoint {
  addSource(source: SourceDescriptor): void;
}

export const sourceExtensionPoint = createExtensionPoint<SourceExtensionPoint>({
  id: 'plugin-agent.sources',
});

/**
 * Extension point that allows backend modules to register event-driven hooks and triggers
 * (e.g., webhook listeners, cron routines, or message queue consumers) into the central AI agent runtime.
 *
 * Registered triggers intercept external platform events and automatically instantiate and route
 * them to execute a specific, pre-configured `AgentDefinition`.
 */
export interface TriggerExtensionPoint {
  addTrigger(trigger: TriggerBinding): void;
}

export const triggerExtensionPoint = createExtensionPoint<TriggerExtensionPoint>({
  id: 'plugin-agent.triggers',
});

/**
 * Extension point for registering domain-specific workflow definitions.
 */
export interface WorkflowRunnerExtensionPoint {
  registerWorkflow(workflow: WorkflowDefinition): void;
}
export const workflowRunnerExtensionPoint =
  createExtensionPoint<WorkflowRunnerExtensionPoint>({
    id: 'plugin-ai.workflow-runner',
  });

/**
 * Extension point that allows specialized backend modules (such as `github`, `gitlab`, or `aws-codecommit`)
 * to register concrete executable tools into the unified Version Control System (VCS) tool group interface.
 *
 * Registered tools are exposed to the core agentic runtime, enabling agent workflows to interact
 * uniformly with repositories, pull requests, and code hosting platforms.
 */
export interface ToolExtensionPoint {
  addTool(tool: ToolDefinition): void;
}

export const toolExtensionPoint = createExtensionPoint<ToolExtensionPoint>({
  id: 'tools-vcs.tools',
});

/**
 * Extension point that allows backend modules to supply concrete language model providers
 * (e.g., OpenAI, Anthropic, Ollama) to the central agent execution runtime.
 *
 * This point enforces modern chat-based language model instances (`BaseChatModel`)
 * and strips out legacy raw completion wrappers to ensure unified tool-calling
 * capability across your 18 agentic workflow plugins.
 */
export interface ChatModelsExtensionPoint {
  addChatModel(d: ChatModelDefinition): void
}

export const chatModelsExtensionPoint = createExtensionPoint<ChatModelsExtensionPoint>({
  id: 'ai-providers.chat-models',
});

/**
 * Extension point that allows backend modules to register text embedding models
 * (e.g., OpenAI text-embedding, HuggingFace, or AWS Bedrock embeddings) with the Vector Databases engine.
 *
 * Registered embedding models provide the essential vectorization layer used by your vector stores
 * (such as `pgvector` or `qdrant`) to index documents and perform semantic similarity searches.
 */
export interface EmbeddingsExtensionPoint {
  addEmbeddings(d: EmbeddingsDefinition): void
}

export const embeddingsExtensionPoint = createExtensionPoint<EmbeddingsExtensionPoint>({
  id: 'databases-vector.embeddings',
});

/**
 * Extension point that allows specialized provider modules (e.g., OpenAI Whisper, AWS Transcribe)
 * to register speech-to-text engines with the central AI Providers service.
 *
 * Registered engines provide raw audio translation capabilities, allowing agentic workflows
 * to consume and interpret spoken-word datasets or audio inputs.
 */
export interface TranscriptionExtensionPoint {
  addTranscription(d: TranscriptionDefinition): void
}

export const transcriptionExtensionPoint = createExtensionPoint<TranscriptionExtensionPoint>({
  id: 'ai-providers.transcription',
});

/**
 * Extension point that allows specialized relevance-ranking engines (e.g., Cohere Rerank, BGE-Reranker)
 * to register themselves with the Vector Databases and retrieval infrastructure.
 *
 * Registered rerankers intercept raw similarity search results from underlying vector stores
 * and optimize document ordering based on precise query contextual alignment before passing context to an agent.
 */
export interface RerankingExtensionPoint {
  addReranking(d: RerankingDefinition): void
}

export const rerankingExtensionPoint = createExtensionPoint<RerankingExtensionPoint>({
  id: 'databases-vector.reranking',
});

/**
 * Extension point that allows specialized safety engines (e.g., Llama Guard, OpenAI Moderation,
 * Azure Content Safety) to register uniform content classifiers with the central AI Providers service.
 *
 * Registered guardrails intercept agent execution boundaries to run classification passes
 * on user inputs or agent output egress, enforcing safety guidelines across all 18 agentic plugins.
 */
export interface GuardrailExtensionPoint {
  addGuardrail(d: GuardrailDefinition): void
}

export const guardrailExtensionPoint = createExtensionPoint<GuardrailExtensionPoint>({
  id: 'ai-providers.guardrails',
});

/**
 * Extension point that allows concrete storage engine modules (e.g., pgvector, Qdrant, Milvus)
 * to register physical vector database instances with the central Vector Databases engine.
 *
 * This point abstracts vector persistence layers completely away from core LLM logic,
 * delivering standardized similarity search and indexing interfaces across your 18 agentic plugins.
 */
export interface VectorStoreExtensionPoint {
  addVectorStore(d: VectorStoreDefinition): void
}

export const vectorStoreExtensionPoint = createExtensionPoint<VectorStoreExtensionPoint>({
  id: 'databases-vector.vector-stores',
});

/**
 * Extension point that allows storage providers (e.g., PostgreSQL, Redis, local memory)
 * to attach underlying persistence engines to the agentic workflow execution layer.
 *
 * It manages the operational lifecycle state of your 18 agentic plugins—handling live session histories,
 * execution checkpoints, structured run telemetry, artifact streaming, audit logs, and cost/usage counters.
 */
export interface RuntimeStoreExtensionPoint {
  setSessionStore(store: SessionStore): void;
  setCheckpointStore(store: CheckpointStore): void;
  setRunStore(store: RunStore): void;
  setArtifactSink(sink: ArtifactSink): void;
  setAuditLogSink(sink: AuditLogSink): void;
  setUsageSink?(sink: UsageSink): void;
  setStateSerializer?(serializer: StateSerializer): void;
}

export const runtimeStoreExtensionPoint =
  createExtensionPoint<RuntimeStoreExtensionPoint>({
    id: 'databases-runtime.stores',
  });
