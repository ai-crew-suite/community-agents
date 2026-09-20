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

/**
 * Storage backends supported for runtime stores with configurable persistence.
 *
 * - `database`: the Knex client supplied by the Backstage core database
 *   service, honoring the site-wide database configuration (PostgreSQL,
 *   MySQL, or SQLite).
 * - `redis`: a dedicated Redis connection configured under
 *   `ai.runtime.stores.redis`.
 */
export type RuntimeStoreBackend = 'database' | 'redis';

/**
 * Redis connection settings shared by all Redis-backed runtime stores.
 */
export interface RedisConnectionConfig {
  /** Connection URL, for example `redis://localhost:6379` or `rediss://` for TLS. */
  connection: string;
  /** Prefix applied to every Redis key written by the runtime stores. */
  keyPrefix: string;
}

/**
 * Resolved configuration for the session store.
 */
export interface SessionStoreConfig {
  backend: RuntimeStoreBackend;
  /** Optional TTL in milliseconds applied to session entries on every write. */
  ttlMs?: number;
  /** Maximum number of messages retained per session. */
  maxMessages: number;
}

/**
 * Resolved configuration for the checkpoint store.
 */
export interface CheckpointStoreConfig {
  backend: RuntimeStoreBackend;
  /** Optional TTL in milliseconds applied to checkpoint entries on every write. */
  ttlMs?: number;
}

/**
 * Fully resolved runtime store module configuration with defaults applied.
 */
export interface RuntimeStoresConfig {
  sessions: SessionStoreConfig;
  checkpoints: CheckpointStoreConfig;
  /** Present whenever at least one store selects the `redis` backend. */
  redis?: RedisConnectionConfig;
}

/** Default prefix applied to Redis keys when none is configured. */
export const DEFAULT_REDIS_KEY_PREFIX = 'ai-core';

/** Default cap on retained session messages for the Redis session store. */
export const DEFAULT_MAX_SESSION_MESSAGES = 100;

const CONFIG_PATH = 'ai.runtime.stores';

const readBackend = (
  stores: Config | undefined,
  key: 'sessions' | 'checkpoints',
): RuntimeStoreBackend => {
  const raw = stores?.getOptionalString(`${key}.backend`) ?? 'database';
  if (raw !== 'database' && raw !== 'redis') {
    throw new Error(
      `AI runtime stores: unsupported backend '${raw}' for '${CONFIG_PATH}.${key}.backend' (expected 'database' or 'redis')`,
    );
  }
  return raw;
};

/**
 * Reads and validates the `ai.runtime.stores` configuration section.
 *
 * @throws When a store selects an unknown backend, or selects the `redis`
 *   backend without a configured `redis.connection`.
 */
export function readRuntimeStoresConfig(config: Config): RuntimeStoresConfig {
  const stores = config.getOptionalConfig(CONFIG_PATH);

  const sessions: SessionStoreConfig = {
    backend: readBackend(stores, 'sessions'),
    ttlMs: stores?.getOptionalNumber('sessions.ttlMs'),
    maxMessages:
      stores?.getOptionalNumber('sessions.maxMessages') ?? DEFAULT_MAX_SESSION_MESSAGES,
  };
  const checkpoints: CheckpointStoreConfig = {
    backend: readBackend(stores, 'checkpoints'),
    ttlMs: stores?.getOptionalNumber('checkpoints.ttlMs'),
  };

  const result: RuntimeStoresConfig = { sessions, checkpoints };

  if (sessions.backend === 'redis' || checkpoints.backend === 'redis') {
    const connection = stores?.getOptionalString('redis.connection');
    if (!connection) {
      throw new Error(
        `AI runtime stores: '${CONFIG_PATH}.redis.connection' is required when a store uses the 'redis' backend`,
      );
    }

    result.redis = {
      connection,
      keyPrefix:
        stores?.getOptionalString('redis.keyPrefix') ?? DEFAULT_REDIS_KEY_PREFIX,
    };
  }

  return result;
}
