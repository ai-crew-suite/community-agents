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
import type { Config } from '@backstage/config';
import type {
  DatabaseService,
  LoggerService,
} from '@backstage/backend-plugin-api';
import Redis from 'ioredis';
import type {
  ArtifactSink,
  AuditLogSink,
  CheckpointStore,
  RunStore,
  SessionStore,
} from '@ai-crew-suite/plugin-kernel-node';
import { readRuntimeStoresConfig } from '../config';
import { applyDatabaseMigrations } from '../database/migrations';
import { RedisCheckpointStore } from './RedisCheckpointStore';
import { RedisSessionStore } from './RedisSessionStore';
import { SqlAgentRuntimeStore } from './SqlAgentRuntimeStore';

/**
 * Services required to assemble the agent runtime stores.
 */
export interface CreateAgentRuntimeStoresOptions {
  logger: LoggerService;
  config: Config;
  database: DatabaseService;
}

/**
 * The composed runtime store bundle registered with the AI backend plugin.
 *
 * Run records, approvals, artifacts, and audit entries are always backed by
 * the SQL store because they form the durable system of record. Sessions and
 * checkpoints can optionally be redirected to Redis through configuration.
 */
export interface AgentRuntimeStores {
  sessionStore: SessionStore;
  checkpointStore: CheckpointStore;
  runStore: RunStore;
  artifactSink: ArtifactSink;
  auditLogSink: AuditLogSink;
}

/**
 * Applies the runtime store migrations and assembles the configured store
 * backends into a single bundle.
 *
 * @throws When the configuration selects the `redis` backend without a
 *   connection, or Redis cannot be reached during startup.
 */
export async function createAgentRuntimeStores(
  options: CreateAgentRuntimeStoresOptions,
): Promise<AgentRuntimeStores> {
  const { logger, config, database } = options;
  const storeConfig = readRuntimeStoresConfig(config);

  logger.info('Starting agent runtime stores');
  const dbClient = await database.getClient();
  await applyDatabaseMigrations(dbClient);
  const sqlStore = new SqlAgentRuntimeStore(dbClient);

  let sessionStore: SessionStore = sqlStore;
  let checkpointStore: CheckpointStore = sqlStore;

  if (
    storeConfig.sessions.backend === 'redis' ||
    storeConfig.checkpoints.backend === 'redis'
  ) {
    const redisConfig = storeConfig.redis;
    if (!redisConfig) {
      // Unreachable: readRuntimeStoresConfig enforces the connection whenever
      // a Redis backend is selected. The guard keeps the type narrow.
      throw new Error(
        "AI runtime stores: 'ai.runtime.stores.redis.connection' is required when a store uses the 'redis' backend",
      );
    }

    const redis = new Redis(redisConfig.connection);
    // Fail fast at boot rather than on the first agent run.
    await redis.ping();

    if (storeConfig.sessions.backend === 'redis') {
      sessionStore = new RedisSessionStore(redis, {
        keyPrefix: redisConfig.keyPrefix,
        ttlMs: storeConfig.sessions.ttlMs,
        maxMessages: storeConfig.sessions.maxMessages,
      });
    }
    if (storeConfig.checkpoints.backend === 'redis') {
      checkpointStore = new RedisCheckpointStore(redis, {
        keyPrefix: redisConfig.keyPrefix,
        ttlMs: storeConfig.checkpoints.ttlMs,
      });
    }
  }

  logger.info(
    `Agent runtime stores initialized: sessions=${storeConfig.sessions.backend}, checkpoints=${storeConfig.checkpoints.backend}, durable=database`,
  );

  return {
    sessionStore,
    checkpointStore,
    runStore: sqlStore,
    artifactSink: sqlStore,
    auditLogSink: sqlStore,
  };
}
