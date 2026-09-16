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
import { BedrockEmbeddings } from '@langchain/aws';
import { AwsCredentialIdentity, Provider } from '@aws-sdk/types';
import {
  DefaultVectorAugmentationIndexer,
  EmbeddingsConfig,
} from '@ai-crew-suite/plugin-retrieval-augmenter-backend';
import { BedrockCohereEmbeddings } from './BedrockCohereEmbeddings';

/**
 * Configuration used to create AWS Bedrock embedding clients.
 */
export type BedrockConfig = {
  /** Bedrock embedding model ID, such as `amazon.titan-embed-text-v1`. */
  modelName: string;
  /** Maximum AWS SDK retry attempts for embedding requests. Defaults to `3`. */
  maxRetries?: number;
  /** Maximum concurrent embedding requests. Defaults to `100`. */
  maxConcurrency?: number;
};

export type BedrockAugmenterConfig = EmbeddingsConfig & {
  /** AWS client options used by the Bedrock embeddings implementation. */
  options: {
    /** Optional explicit credentials; omitted credentials use the AWS SDK provider chain. */
    credentials?: AwsCredentialIdentity | Provider<AwsCredentialIdentity>;
    /** AWS region where Bedrock embeddings should be invoked. */
    region: string;
  };
  /** Bedrock model and client tuning options. */
  bedrockConfig: BedrockConfig;
};

/**
 * Vector augmentation indexer backed by AWS Bedrock embeddings.
 *
 * Cohere Bedrock embedding models use a specialized wrapper so document and
 * query embeddings match LangChain's expected shape; all other Bedrock models
 * use the standard `BedrockEmbeddings` implementation.
 */
export class BedrockAugmenter extends DefaultVectorAugmentationIndexer {
  constructor(config: BedrockAugmenterConfig) {
    if (!config.bedrockConfig.modelName?.trim()) {
      config.logger.error('AWS Bedrock embeddings modelName is required.');
      throw new Error('AWS Bedrock embeddings modelName is required.');
    }

    const embeddingsConfig = {
      region: config.options.region,
      credentials: config.options.credentials,
      model: config.bedrockConfig.modelName,
    };
    const embeddings = config.bedrockConfig.modelName.toLowerCase().includes('cohere')
      ? new BedrockCohereEmbeddings({
          ...embeddingsConfig,
          maxRetries: config.bedrockConfig.maxRetries ?? 3,
          maxConcurrency: config.bedrockConfig.maxConcurrency ?? 100,
        })
      : new BedrockEmbeddings({
          ...embeddingsConfig,
          maxRetries: config.bedrockConfig.maxRetries ?? 3,
          maxConcurrency: config.bedrockConfig.maxConcurrency ?? 100,
        });

    super({ ...config, embeddings });
  }
}
