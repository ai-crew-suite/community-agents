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
import type {
  DatabaseService,
  LoggerService,
} from '@backstage/backend-plugin-api';
import { mockServices } from '@backstage/backend-test-utils';
import type { Knex } from 'knex';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyDatabaseMigrations } from '../../database/migrations';
import { createAgentRuntimeStores } from '../factory';
import { RedisCheckpointStore } from '../RedisCheckpointStore';
import { RedisSessionStore } from '../RedisSessionStore';
import { SqlAgentRuntimeStore } from '../SqlAgentRuntimeStore';

vi.mock('../../database/migrations', () => ({
  applyDatabaseMigrations: vi.fn(async () => undefined),
}));

const mocks = vi.hoisted(() => {
  const ping = vi.fn(async () => 'PONG');
  // A `function` body so the mock can be used with `new`.
  const redisConstructor = vi.fn(function () {
    return { ping };
  });
  return { ping, redisConstructor };
});

vi.mock('ioredis', () => ({ default: mocks.redisConstructor }));

const createLogger = () =>
  ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(),
  } as unknown as LoggerService & { info: ReturnType<typeof vi.fn> });

const createDatabase = (client: Knex) =>
  ({
    getClient: vi.fn(async () => client),
  } as unknown as DatabaseService & { getClient: ReturnType<typeof vi.fn> });

type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];
type JsonObject = { [key: string]: JsonValue };
type ConfigData = JsonObject;

const configWith = (stores?: ConfigData) =>
  mockServices.rootConfig({
    data: stores === undefined ? {} : { ai: { runtime: { stores } } },
  });

describe('createAgentRuntimeStores', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the SQL store for every contract by default', async () => {
    const logger = createLogger();
    const dbClient = {} as Knex;
    const database = createDatabase(dbClient);

    const stores = await createAgentRuntimeStores({
      logger,
      database,
      config: configWith(),
    });

    expect(database.getClient).toHaveBeenCalledTimes(1);
    expect(applyDatabaseMigrations).toHaveBeenCalledWith(dbClient);
    expect(mocks.redisConstructor).not.toHaveBeenCalled();
    expect(stores.sessionStore).toBeInstanceOf(SqlAgentRuntimeStore);
    expect(stores.checkpointStore).toBeInstanceOf(SqlAgentRuntimeStore);
    expect(stores.runStore).toBeInstanceOf(SqlAgentRuntimeStore);
    expect(stores.artifactSink).toBeInstanceOf(SqlAgentRuntimeStore);
    expect(stores.auditLogSink).toBeInstanceOf(SqlAgentRuntimeStore);
  });

  it('redirects only the session store to Redis when configured', async () => {
    const stores = await createAgentRuntimeStores({
      logger: createLogger(),
      database: createDatabase({} as Knex),
      config: configWith({
        sessions: { backend: 'redis' },
        redis: { connection: 'redis://localhost:6379' },
      }),
    });

    expect(mocks.redisConstructor).toHaveBeenCalledWith('redis://localhost:6379');
    expect(mocks.ping).toHaveBeenCalledTimes(1);
    expect(stores.sessionStore).toBeInstanceOf(RedisSessionStore);
    expect(stores.checkpointStore).toBeInstanceOf(SqlAgentRuntimeStore);
    expect(stores.runStore).toBeInstanceOf(SqlAgentRuntimeStore);
  });

  it('redirects only the checkpoint store to Redis when configured', async () => {
    const stores = await createAgentRuntimeStores({
      logger: createLogger(),
      database: createDatabase({} as Knex),
      config: configWith({
        checkpoints: { backend: 'redis', ttlMs: 30000 },
        redis: { connection: 'rediss://cache.example.com:6380' },
      }),
    });

    expect(mocks.redisConstructor).toHaveBeenCalledWith(
      'rediss://cache.example.com:6380',
    );
    expect(stores.checkpointStore).toBeInstanceOf(RedisCheckpointStore);
    expect(stores.sessionStore).toBeInstanceOf(SqlAgentRuntimeStore);
  });

  it('fails fast before touching the database when Redis is selected without a connection', async () => {
    const database = createDatabase({} as Knex);

    await expect(
      createAgentRuntimeStores({
        logger: createLogger(),
        database,
        config: configWith({ sessions: { backend: 'redis' } }),
      }),
    ).rejects.toThrow(/redis\.connection' is required/);
    expect(database.getClient).not.toHaveBeenCalled();
  });
});
