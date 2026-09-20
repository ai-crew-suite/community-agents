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
import type { LoggerService } from '@backstage/backend-plugin-api';
import type { QdrantClient } from '@qdrant/js-client-rest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QdrantVectorStore } from '../QdrantVectorStore';

const createLogger = () =>
  ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(),
  }) as unknown as LoggerService & { info: ReturnType<typeof vi.fn> };

const createClient = () => {
  const client = {
    getCollections: vi.fn(async () => ({
      collections: [] as { name: string }[],
    })),
    createCollection: vi.fn(async () => true),
    upsert: vi.fn(async () => ({ status: 'ok' })),
    delete: vi.fn(async () => ({ status: 'ok' })),
    query: vi.fn(async () => ({ points: [] as unknown[] })),
  };
  return client as unknown as QdrantClient & typeof client;
};

const createEmbeddings = (overrides: Partial<Embeddings> = {}) =>
  ({
    embedDocuments: vi.fn(async () => [[0.1, 0.2]]),
    embedQuery: vi.fn(async () => [0.3, 0.4]),
    ...overrides,
  }) as Embeddings;

describe('QdrantVectorStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('embeds and upserts documents using the configured batch size', async () => {
    const logger = createLogger();
    const client = createClient();
    const embeddings = createEmbeddings({
      embedDocuments: vi.fn(async () => [
        [0.1, 0.2],
        [0.3, 0.4],
        [0.5, 0.6],
      ]),
    });
    const store = await QdrantVectorStore.initialize({
      client,
      logger,
      collectionName: 'docs',
      chunkSize: 2,
    });
    store.connectEmbeddings(embeddings);

    await store.addDocuments([
      { content: 'alpha', metadata: { source: 'catalog' } },
      { content: 'beta', metadata: { source: 'catalog' } },
      { content: 'gamma', metadata: { source: 'tech-docs' } },
    ]);

    expect(embeddings.embedDocuments).toHaveBeenCalledWith([
      'alpha',
      'beta',
      'gamma',
    ]);
    expect(client.createCollection).toHaveBeenCalledWith('docs', {
      vectors: { size: 2, distance: 'Cosine' },
    });
    expect(client.upsert).toHaveBeenCalledTimes(2);
    expect(client.upsert).toHaveBeenNthCalledWith(1, 'docs', {
      wait: true,
      points: [
        {
          id: expect.any(String),
          vector: [0.1, 0.2],
          payload: { content: 'alpha', metadata: { source: 'catalog' } },
        },
        {
          id: expect.any(String),
          vector: [0.3, 0.4],
          payload: { content: 'beta', metadata: { source: 'catalog' } },
        },
      ],
    });
    expect(client.upsert).toHaveBeenNthCalledWith(2, 'docs', {
      wait: true,
      points: [
        {
          id: expect.any(String),
          vector: [0.5, 0.6],
          payload: { content: 'gamma', metadata: { source: 'tech-docs' } },
        },
      ],
    });
    expect(logger.info).toHaveBeenCalledWith(
      'Received 3 vectors from embeddings creation.',
    );
  });

  it('rejects document insertion when embeddings are not connected', async () => {
    const store = await QdrantVectorStore.initialize({
      client: createClient(),
      logger: createLogger(),
    });

    await expect(
      store.addDocuments([
        { content: 'hello', metadata: { source: 'catalog' } },
      ]),
    ).rejects.toThrow('No Embeddings configured for the vector store.');
  });

  it('logs and rejects mismatched embedding vector counts before inserting', async () => {
    const logger = createLogger();
    const client = createClient();
    const embeddings = createEmbeddings({
      embedDocuments: vi.fn(async () => []),
    });
    const store = await QdrantVectorStore.initialize({ client, logger });
    store.connectEmbeddings(embeddings);

    await expect(
      store.addDocuments([
        { content: 'hello', metadata: { source: 'catalog' } },
      ]),
    ).rejects.toThrow('Embedding provider returned 0 vectors for 1 documents.');

    expect(logger.error).toHaveBeenCalledWith(
      'Embedding provider returned 0 vectors for 1 documents.',
    );
    expect(client.upsert).not.toHaveBeenCalled();
  });

  it('validates document deletion parameters and deletes by id', async () => {
    const client = createClient();
    const store = await QdrantVectorStore.initialize({
      client,
      logger: createLogger(),
    });

    await expect(store.deleteDocuments({})).rejects.toThrow(
      'You must specify either ids or a filter when deleting documents.',
    );
    await expect(
      store.deleteDocuments({ ids: ['doc-1'], filter: { source: 'catalog' } }),
    ).rejects.toThrow(
      'You cannot specify both ids and a filter when deleting documents.',
    );

    await store.deleteDocuments({ ids: ['doc-1'] });

    expect(client.delete).toHaveBeenCalledWith('embeddings', {
      wait: true,
      points: ['doc-1'],
    });
  });

  it('translates metadata filters into Qdrant match clauses when deleting', async () => {
    const client = createClient();
    const store = await QdrantVectorStore.initialize({
      client,
      logger: createLogger(),
    });

    await store.deleteDocuments({ filter: { source: 'catalog' } });

    expect(client.delete).toHaveBeenCalledWith('embeddings', {
      wait: true,
      filter: {
        must: [{ key: 'metadata.source', match: { value: 'catalog' } }],
      },
    });
  });

  it('embeds query text and returns similarity matches with string content', async () => {
    const client = createClient();
    client.getCollections.mockResolvedValue({
      collections: [{ name: 'embeddings' }],
    });
    client.query.mockResolvedValue({
      points: [
        {
          id: 'doc-1',
          score: 0.92,
          payload: { content: 'catalog doc', metadata: { source: 'catalog' } },
        },
        {
          id: 'doc-2',
          score: 0.81,
          payload: { content: null, metadata: { source: 'catalog' } },
        },
      ],
    });
    const embeddings = createEmbeddings();
    const store = await QdrantVectorStore.initialize({
      client,
      logger: createLogger(),
      amount: 8,
    });
    store.connectEmbeddings(embeddings);

    await expect(
      store.similaritySearch('owner?', { source: 'catalog' }),
    ).resolves.toEqual([
      { content: 'catalog doc', metadata: { source: 'catalog' } },
    ]);

    expect(embeddings.embedQuery).toHaveBeenCalledWith('owner?');
    expect(client.query).toHaveBeenCalledWith('embeddings', {
      query: [0.3, 0.4],
      limit: 8,
      filter: {
        must: [{ key: 'metadata.source', match: { value: 'catalog' } }],
      },
      with_payload: true,
    });
  });

  it('reuses an existing collection instead of recreating it', async () => {
    const client = createClient();
    client.getCollections.mockResolvedValue({
      collections: [{ name: 'embeddings' }],
    });
    const store = await QdrantVectorStore.initialize({
      client,
      logger: createLogger(),
    });
    store.connectEmbeddings(createEmbeddings());

    await store.addDocuments([
      { content: 'hello', metadata: { source: 'catalog' } },
    ]);

    expect(client.createCollection).not.toHaveBeenCalled();
    expect(client.upsert).toHaveBeenCalledTimes(1);
  });
});
