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
import type { DatabaseService, LoggerService } from '@backstage/backend-plugin-api';
import type { Config } from '@backstage/config';
import type { Knex } from 'knex';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyDatabaseMigrations } from '../../database/migrations';
import { PgVectorStore } from '../PgVectorStore';
import { createPgVectorStore } from '..';

vi.mock('../../database/migrations', () => ({
  applyDatabaseMigrations: vi.fn(async () => undefined),
}));

const createLogger = () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(),
}) as unknown as LoggerService & { info: ReturnType<typeof vi.fn> };

const createDatabase = (client: Knex) => ({
  getClient: vi.fn(async () => client),
}) as unknown as DatabaseService & { getClient: ReturnType<typeof vi.fn> };

const createConfig = (pgVectorConfig?: { amount?: number; chunkSize?: number }) => ({
  getOptionalConfig: vi.fn((path: string) => {
    if (path !== 'ai.storage.pgVector' || !pgVectorConfig) {
      return undefined;
    }

    return {
      getOptionalNumber: vi.fn((key: string) => {
        if (key === 'amount') {
          return pgVectorConfig.amount;
        }
        if (key === 'chunkSize') {
          return pgVectorConfig.chunkSize;
        }
        return undefined;
      }),
    };
  }),
}) as unknown as Config & { getOptionalConfig: ReturnType<typeof vi.fn> };

describe('pgvector service factories', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs migrations and passes configured vector options into PgVectorStore', async () => {
    const logger = createLogger();
    const dbClient = {} as Knex;
    const database = createDatabase(dbClient);
    const config = createConfig({ amount: 8, chunkSize: 250 });
    const vectorStore = { connectEmbeddings: vi.fn() };
    const initialize = vi.spyOn(PgVectorStore, 'initialize').mockResolvedValueOnce(
      vectorStore as unknown as PgVectorStore,
    );

    await expect(createPgVectorStore({ logger, database, config })).resolves.toBe(vectorStore);

    expect(logger.info).toHaveBeenCalledWith('Starting PgVectorStore');
    expect(database.getClient).toHaveBeenCalledTimes(1);
    expect(applyDatabaseMigrations).toHaveBeenCalledWith(dbClient);
    expect(config.getOptionalConfig).toHaveBeenCalledWith('ai.storage.pgVector');
    expect(initialize).toHaveBeenCalledWith({
      logger,
      db: dbClient,
      chunkSize: 250,
      amount: 8,
    });
  });

  it('uses PgVectorStore defaults when pgvector config is absent', async () => {
    const logger = createLogger();
    const dbClient = {} as Knex;
    const database = createDatabase(dbClient);
    const config = createConfig();
    const vectorStore = { connectEmbeddings: vi.fn() };
    const initialize = vi.spyOn(PgVectorStore, 'initialize').mockResolvedValueOnce(
      vectorStore as unknown as PgVectorStore,
    );

    await createPgVectorStore({ logger, database, config });

    expect(initialize).toHaveBeenCalledWith({
      logger,
      db: dbClient,
      chunkSize: undefined,
      amount: undefined,
    });
  });
});