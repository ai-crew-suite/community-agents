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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QdrantVectorStore } from '../QdrantVectorStore';
import { createQdrantVectorStore } from '..';

const createLogger = () =>
  ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(),
  }) as unknown as LoggerService & { info: ReturnType<typeof vi.fn> };

const createConfig = (qdrantConfig?: {
  url?: string;
  apiKey?: string;
  collectionName?: string;
  amount?: number;
  chunkSize?: number;
}) =>
  ({
    getOptionalConfig: vi.fn((path: string) => {
      if (path !== 'ai.storage.qdrant' || !qdrantConfig) {
        return undefined;
      }

      return {
        getOptionalString: vi.fn((key: string) => {
          if (key === 'url') {
            return qdrantConfig.url;
          }
          if (key === 'apiKey') {
            return qdrantConfig.apiKey;
          }
          if (key === 'collectionName') {
            return qdrantConfig.collectionName;
          }
          return undefined;
        }),
        getOptionalNumber: vi.fn((key: string) => {
          if (key === 'amount') {
            return qdrantConfig.amount;
          }
          if (key === 'chunkSize') {
            return qdrantConfig.chunkSize;
          }
          return undefined;
        }),
      };
    }),
  }) as unknown as Config & { getOptionalConfig: ReturnType<typeof vi.fn> };

describe('qdrant service factories', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('passes configured qdrant options into QdrantVectorStore', async () => {
    const logger = createLogger();
    const config = createConfig({
      url: 'https://qdrant.example.com',
      apiKey: 'secret',
      collectionName: 'crew-embeddings',
      amount: 8,
      chunkSize: 250,
    });
    const vectorStore = { connectEmbeddings: vi.fn() };
    const initialize = vi
      .spyOn(QdrantVectorStore, 'initialize')
      .mockResolvedValueOnce(vectorStore as unknown as QdrantVectorStore);

    await expect(createQdrantVectorStore({ logger, config })).resolves.toBe(
      vectorStore,
    );

    expect(logger.info).toHaveBeenCalledWith('Starting QdrantVectorStore');
    expect(config.getOptionalConfig).toHaveBeenCalledWith('ai.storage.qdrant');
    expect(initialize).toHaveBeenCalledWith({
      logger,
      url: 'https://qdrant.example.com',
      apiKey: 'secret',
      collectionName: 'crew-embeddings',
      amount: 8,
      chunkSize: 250,
    });
  });

  it('falls back to environment variables and defaults when config is absent', async () => {
    const logger = createLogger();
    const config = createConfig();
    const initialize = vi
      .spyOn(QdrantVectorStore, 'initialize')
      .mockResolvedValueOnce({} as QdrantVectorStore);

    await createQdrantVectorStore({ logger, config });

    expect(initialize).toHaveBeenCalledWith({
      logger,
      url: 'http://localhost:6333',
      apiKey: undefined,
      collectionName: 'embeddings',
      amount: undefined,
      chunkSize: undefined,
    });
  });

  it('prefers environment variables over built-in defaults', async () => {
    vi.stubEnv('QDRANT_URL', 'http://qdrant.internal:6333');
    vi.stubEnv('QDRANT_API_KEY', 'env-secret');
    const logger = createLogger();
    const config = createConfig();
    const initialize = vi
      .spyOn(QdrantVectorStore, 'initialize')
      .mockResolvedValueOnce({} as QdrantVectorStore);

    await createQdrantVectorStore({ logger, config });

    expect(initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'http://qdrant.internal:6333',
        apiKey: 'env-secret',
      }),
    );
  });
});
