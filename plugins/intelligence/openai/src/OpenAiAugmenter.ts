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
import { OpenAIEmbeddings } from '@langchain/openai';
import {
  DefaultVectorAugmentationIndexer,
  EmbeddingsConfig,
} from '@ai-crew-suite/plugin-kernel-backend-module-retrieval-augmenter';

const DEFAULT_OPENAI_EMBEDDINGS_MODEL = 'text-embedding-3-small';

/**
 * Configuration used to create OpenAI embedding clients.
 */
export type OpenAiConfig = {
  /** OpenAI embeddings model name. Defaults to `text-embedding-3-small`. */
  modelName?: string;
  /** Optional API key; omitted values use the OpenAI SDK environment defaults. */
  openAiApiKey?: string;
  /** Number of documents to embed per OpenAI request. LangChain defaults to `512`. */
  batchSize?: number;
  /** Optional dimensions override for models that support shortened embeddings. */
  embeddingsDimensions?: number;
  /** Optional OpenAI-compatible base URL, such as an enterprise proxy endpoint. */
  openAiBaseUrl?: string;
};

export type OpenAiAugmenterConfig = EmbeddingsConfig & {
  /** OpenAI model and client options. */
  config: OpenAiConfig;
};

/**
 * Vector augmentation indexer backed by OpenAI embeddings.
 *
 * The indexer delegates document loading and vector persistence to the shared
 * retrieval augmenter base class while configuring LangChain's OpenAI
 * embeddings client from Backstage app config.
 */
export class OpenAiAugmenter extends DefaultVectorAugmentationIndexer {
  constructor(config: OpenAiAugmenterConfig) {
    if (config.config.batchSize !== undefined && config.config.batchSize <= 0) {
      config.logger.error('OpenAI embeddings batchSize must be greater than 0.');
      throw new Error('OpenAI embeddings batchSize must be greater than 0.');
    }

    if (
      config.config.embeddingsDimensions !== undefined &&
      config.config.embeddingsDimensions <= 0
    ) {
      config.logger.error('OpenAI embeddings dimensions must be greater than 0.');
      throw new Error('OpenAI embeddings dimensions must be greater than 0.');
    }

    const modelName = config.config.modelName?.trim() || DEFAULT_OPENAI_EMBEDDINGS_MODEL;
    const embeddings = new OpenAIEmbeddings({
      configuration: {
        baseURL: config.config.openAiBaseUrl,
      },
      openAIApiKey: config.config.openAiApiKey,
      batchSize: config.config.batchSize,
      modelName,
      dimensions: config.config.embeddingsDimensions,
    });
    super({ ...config, embeddings });
  }
}
