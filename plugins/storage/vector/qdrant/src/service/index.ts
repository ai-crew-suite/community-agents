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
import type { VectorStore } from '@ai-crew-suite/plugin-kernel-node';
import { QdrantVectorStore } from './QdrantVectorStore';
import type {
  QdrantVectorStoreInitConfig,
  QdrantVectorStoreOptions,
} from '../@types';

const DEFAULT_QDRANT_URL = 'http://localhost:6333';
const DEFAULT_COLLECTION_NAME = 'embeddings';

/**
 * Creates the Qdrant-backed vector store used by indexing and retrieval.
 *
 * The factory reads optional `ai.storage.qdrant` tuning values, falling back
 * to the `QDRANT_URL` and `QDRANT_API_KEY` environment variables, and returns
 * a configured `VectorStore` implementation. Runtime persistence for agent
 * sessions, runs, and audit data is intentionally out of scope for this
 * module; see the pgvector storage module for that contract.
 */
export async function createQdrantVectorStore({
  logger,
  config,
}: QdrantVectorStoreInitConfig): Promise<VectorStore> {
  logger.info('Starting QdrantVectorStore');

  const qdrantConfig = config.getOptionalConfig('ai.storage.qdrant');
  const options: QdrantVectorStoreOptions = {
    url:
      qdrantConfig?.getOptionalString('url') ??
      process.env.QDRANT_URL ??
      DEFAULT_QDRANT_URL,
    apiKey:
      qdrantConfig?.getOptionalString('apiKey') ?? process.env.QDRANT_API_KEY,
    collectionName:
      qdrantConfig?.getOptionalString('collectionName') ??
      DEFAULT_COLLECTION_NAME,
    amount: qdrantConfig?.getOptionalNumber('amount'),
    chunkSize: qdrantConfig?.getOptionalNumber('chunkSize'),
  };

  return QdrantVectorStore.initialize({
    logger,
    ...options,
  });
}
