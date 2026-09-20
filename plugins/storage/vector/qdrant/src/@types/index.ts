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
import type { LoggerService } from '@backstage/backend-plugin-api';
import type { Config } from '@backstage/config';
import type { QdrantClient } from '@qdrant/js-client-rest';

/**
 * Inputs accepted by the {@link createQdrantVectorStore} factory.
 */
export interface QdrantVectorStoreInitConfig {
  logger: LoggerService;
  config: Config;
}

/**
 * Optional tuning values read from `ai.storage.qdrant`.
 */
export interface QdrantVectorStoreOptions {
  /**
   * Base URL of the Qdrant HTTP API.
   * @default http://localhost:6333
   */
  url?: string;

  /**
   * API key for Qdrant. Omit for unauthenticated local deployments.
   */
  apiKey?: string;

  /**
   * Collection used to store embedding points.
   * @default embeddings
   */
  collectionName?: string;

  /**
   * The number of points sent to Qdrant per upsert batch.
   * @default 500
   */
  chunkSize?: number;

  /**
   * The default amount of embeddings to return when querying vectors with similarity search.
   * @default 4
   */
  amount?: number;
}

/**
 * Construction configuration for {@link QdrantVectorStore}.
 */
export interface QdrantVectorStoreConfig extends QdrantVectorStoreOptions {
  logger: LoggerService;

  /**
   * Pre-built Qdrant client. Supplying a client is primarily useful for tests
   * or deployments that need full control over transport options.
   */
  client?: QdrantClient;
}
