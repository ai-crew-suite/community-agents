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
import type { Embeddings } from '@langchain/core/embeddings';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BedrockAugmenter, BedrockAugmenterConfig } from '../BedrockAugmenter';
import { BedrockCohereEmbeddings } from '../BedrockCohereEmbeddings';
import { BedrockEmbeddings } from '@langchain/aws';

vi.mock('@langchain/aws', () => ({
  BedrockEmbeddings: vi.fn(function BedrockEmbeddingsMock(this: Embeddings) {
    return this;
  }),
}));

vi.mock('../BedrockCohereEmbeddings', () => ({
  BedrockCohereEmbeddings: vi.fn(function BedrockCohereEmbeddingsMock(this: Embeddings) {
    return this;
  }),
}));

const createLogger = () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(),
});

const createConfig = (modelName: string): BedrockAugmenterConfig => ({
  vectorStore: {
    connectEmbeddings: vi.fn(),
    addDocuments: vi.fn(),
    deleteDocuments: vi.fn(),
    similaritySearch: vi.fn(),
  },
  catalogApi: {} as BedrockAugmenterConfig['catalogApi'],
  discovery: {} as BedrockAugmenterConfig['discovery'],
  auth: {} as BedrockAugmenterConfig['auth'],
  logger: createLogger() as BedrockAugmenterConfig['logger'],
  options: {
    region: 'us-east-1',
  },
  bedrockConfig: {
    modelName,
  },
});

describe('BedrockAugmenter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the standard Bedrock embeddings client for non-Cohere models', () => {
    const config = createConfig('amazon.titan-embed-text-v1');
    // eslint-disable-next-line no-new
    new BedrockAugmenter(config);

    expect(BedrockEmbeddings).toHaveBeenCalledWith({
      region: 'us-east-1',
      credentials: undefined,
      model: 'amazon.titan-embed-text-v1',
      maxRetries: 3,
      maxConcurrency: 100,
    });
    expect(BedrockCohereEmbeddings).not.toHaveBeenCalled();
    expect(config.vectorStore.connectEmbeddings).toHaveBeenCalledTimes(1);
  });

  it('uses the Cohere wrapper for Cohere Bedrock embedding models', () => {
    const config = createConfig('cohere.embed-english-v3');
    config.bedrockConfig.maxRetries = 5;
    config.bedrockConfig.maxConcurrency = 12;
    // eslint-disable-next-line no-new
    new BedrockAugmenter(config);

    expect(BedrockCohereEmbeddings).toHaveBeenCalledWith({
      region: 'us-east-1',
      credentials: undefined,
      model: 'cohere.embed-english-v3',
      maxRetries: 5,
      maxConcurrency: 12,
    });
    expect(BedrockEmbeddings).not.toHaveBeenCalled();
  });

  it('logs and rejects missing Bedrock model configuration', () => {
    const config = createConfig('   ');

    expect(() => new BedrockAugmenter(config)).toThrow(
      'AWS Bedrock embeddings modelName is required.',
    );
    expect(config.logger.error).toHaveBeenCalledWith(
      'AWS Bedrock embeddings modelName is required.',
    );
    expect(config.vectorStore.connectEmbeddings).not.toHaveBeenCalled();
  });
});
