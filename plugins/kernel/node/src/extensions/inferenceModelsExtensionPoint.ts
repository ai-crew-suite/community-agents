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
import { createExtensionPoint } from '@backstage/backend-plugin-api';
import type {
  ChatModelDefinition,
  EmbeddingsDefinition,
  GuardrailDefinition,
  RerankingDefinition,
  TranscriptionDefinition,
} from '../types';

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
