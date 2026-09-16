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
import { OpenAIEmbeddings } from '@langchain/openai';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenAiAugmenter, OpenAiAugmenterConfig } from '../OpenAiAugmenter';

vi.mock('@langchain/openai', () => ({
  OpenAIEmbeddings: vi.fn(function OpenAIEmbeddingsMock(this: Embeddings) {
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

const createConfig = (
  openAiConfig: OpenAiAugmenterConfig['config'] = {},
): OpenAiAugmenterConfig => ({
  vectorStore: {
    connectEmbeddings: vi.fn(),
    addDocuments: vi.fn(),
    deleteDocuments: vi.fn(),
    similaritySearch: vi.fn(),
  },
  catalogApi: {} as OpenAiAugmenterConfig['catalogApi'],
  discovery: {} as OpenAiAugmenterConfig['discovery'],
  auth: {} as OpenAiAugmenterConfig['auth'],
  logger: createLogger() as OpenAiAugmenterConfig['logger'],
  config: openAiConfig,
});

describe('OpenAiAugmenter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the default OpenAI embeddings model when none is configured', () => {
    const config = createConfig();
    // eslint-disable-next-line no-new
    new OpenAiAugmenter(config);

    expect(OpenAIEmbeddings).toHaveBeenCalledWith({
      configuration: { baseURL: undefined },
      openAIApiKey: undefined,
      batchSize: undefined,
      modelName: 'text-embedding-3-small',
      dimensions: undefined,
    });
    expect(config.vectorStore.connectEmbeddings).toHaveBeenCalledTimes(1);
  });

  it('passes configured OpenAI embedding options to LangChain', () => {
    const config = createConfig({
      modelName: ' text-embedding-3-large ',
      openAiApiKey: 'test-key',
      openAiBaseUrl: 'https://openai.example.test/v1',
      batchSize: 128,
      embeddingsDimensions: 1024,
    });
    // eslint-disable-next-line no-new
    new OpenAiAugmenter(config);

    expect(OpenAIEmbeddings).toHaveBeenCalledWith({
      configuration: { baseURL: 'https://openai.example.test/v1' },
      openAIApiKey: 'test-key',
      batchSize: 128,
      modelName: 'text-embedding-3-large',
      dimensions: 1024,
    });
  });

  it('logs and rejects invalid batch size configuration', () => {
    const config = createConfig({ batchSize: 0 });

    expect(() => new OpenAiAugmenter(config)).toThrow(
      'OpenAI embeddings batchSize must be greater than 0.',
    );
    expect(config.logger.error).toHaveBeenCalledWith(
      'OpenAI embeddings batchSize must be greater than 0.',
    );
    expect(OpenAIEmbeddings).not.toHaveBeenCalled();
    expect(config.vectorStore.connectEmbeddings).not.toHaveBeenCalled();
  });

  it('logs and rejects invalid dimensions configuration', () => {
    const config = createConfig({ embeddingsDimensions: -1 });

    expect(() => new OpenAiAugmenter(config)).toThrow(
      'OpenAI embeddings dimensions must be greater than 0.',
    );
    expect(config.logger.error).toHaveBeenCalledWith(
      'OpenAI embeddings dimensions must be greater than 0.',
    );
    expect(OpenAIEmbeddings).not.toHaveBeenCalled();
    expect(config.vectorStore.connectEmbeddings).not.toHaveBeenCalled();
  });
});
