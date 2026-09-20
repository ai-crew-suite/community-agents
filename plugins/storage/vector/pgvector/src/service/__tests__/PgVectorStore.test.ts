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
import type { Knex } from 'knex';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgVectorStore } from '../PgVectorStore';

const createLogger = () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(),
});

const createKnex = () => {
  const whereIn = vi.fn(async () => undefined);
  const deleteQuery = vi.fn(() => ({ whereIn }));
  const tableQuery = vi.fn(() => ({ delete: deleteQuery }));
  const raw = vi.fn(async () => ({ rows: [] }));
  const batchInsert = vi.fn(async () => undefined);
  const db = Object.assign(tableQuery, { raw, batchInsert }) as unknown as Knex & {
    raw: ReturnType<typeof vi.fn>;
    batchInsert: ReturnType<typeof vi.fn>;
  };

  return { db, batchInsert, raw, tableQuery, deleteQuery, whereIn };
};

const createEmbeddings = (overrides: Partial<Embeddings> = {}) =>
  ({
    embedDocuments: vi.fn(async () => [[0.1, 0.2]]),
    embedQuery: vi.fn(async () => [0.3, 0.4]),
    ...overrides,
  }) as Embeddings;

describe('PgVectorStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('embeds and inserts documents using the configured batch size', async () => {
    const logger = createLogger();
    const { db, batchInsert } = createKnex();
    const embeddings = createEmbeddings();
    const store = await PgVectorStore.initialize({
      db,
      logger,
      chunkSize: 2,
    });
    store.connectEmbeddings(embeddings);

    await store.addDocuments([
      { content: 'hello\0 world', metadata: { source: 'catalog' } },
    ]);

    expect(embeddings.embedDocuments).toHaveBeenCalledWith(['hello\0 world']);
    expect(batchInsert).toHaveBeenCalledWith(
      'embeddings',
      [
        {
          content: 'hello world',
          vector: '[0.1,0.2]',
          metadata: { source: 'catalog' },
        },
      ],
      2,
    );
    expect(logger.info).toHaveBeenCalledWith(
      'Received 1 vectors from embeddings creation.',
    );
  });

  it('rejects document insertion when embeddings are not connected', async () => {
    const { db } = createKnex();
    const store = await PgVectorStore.initialize({
      db,
      logger: createLogger(),
    });

    await expect(
      store.addDocuments([{ content: 'hello', metadata: { source: 'catalog' } }]),
    ).rejects.toThrow('No Embeddings configured for the vector store.');
  });

  it('logs and rejects mismatched embedding vector counts before inserting', async () => {
    const logger = createLogger();
    const { db, batchInsert } = createKnex();
    const embeddings = createEmbeddings({
      embedDocuments: vi.fn(async () => []),
    });
    const store = await PgVectorStore.initialize({ db, logger });
    store.connectEmbeddings(embeddings);

    await expect(
      store.addDocuments([{ content: 'hello', metadata: { source: 'catalog' } }]),
    ).rejects.toThrow('Embedding provider returned 0 vectors for 1 documents.');

    expect(logger.error).toHaveBeenCalledWith(
      'Embedding provider returned 0 vectors for 1 documents.',
    );
    expect(batchInsert).not.toHaveBeenCalled();
  });

  it('validates document deletion parameters and deletes by id', async () => {
    const { db, tableQuery, deleteQuery, whereIn } = createKnex();
    const store = await PgVectorStore.initialize({
      db,
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

    expect(tableQuery).toHaveBeenCalledWith('embeddings');
    expect(deleteQuery).toHaveBeenCalledTimes(1);
    expect(whereIn).toHaveBeenCalledWith('id', ['doc-1']);
  });

  it('embeds query text and returns non-empty similarity matches', async () => {
    const { db, raw } = createKnex();
    raw.mockResolvedValueOnce({
      rows: [
        { content: 'catalog doc', metadata: { source: 'catalog' }, _distance: 0.12 },
        { content: null, metadata: { source: 'catalog' }, _distance: 0.13 },
      ],
    });
    const embeddings = createEmbeddings();
    const store = await PgVectorStore.initialize({
      db,
      logger: createLogger(),
      amount: 8,
    });
    store.connectEmbeddings(embeddings);

    await expect(store.similaritySearch('owner?', { source: 'catalog' })).resolves.toEqual([
      { content: 'catalog doc', metadata: { source: 'catalog' } },
    ]);

    expect(embeddings.embedQuery).toHaveBeenCalledWith('owner?');
    expect(raw).toHaveBeenCalledWith(expect.stringContaining('ORDER BY "_distance" ASC'), {
      embeddingString: '[0.3,0.4]',
      filter: JSON.stringify({ source: 'catalog' }),
      amount: 8,
    });
  });
});