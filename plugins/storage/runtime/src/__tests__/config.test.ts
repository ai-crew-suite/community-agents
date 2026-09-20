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
import { mockServices } from '@backstage/backend-test-utils';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAX_SESSION_MESSAGES,
  DEFAULT_REDIS_KEY_PREFIX,
  readRuntimeStoresConfig,
} from '../config';

type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];
type JsonObject = { [key: string]: JsonValue };
type ConfigData = JsonObject;

const configWith = (stores?: ConfigData) =>
  mockServices.rootConfig({
    data: stores === undefined ? {} : { ai: { runtime: { stores } } },
  });

describe('readRuntimeStoresConfig', () => {
  it('defaults both configurable stores to the database backend', () => {
    const result = readRuntimeStoresConfig(configWith());

    expect(result.sessions).toEqual({
      backend: 'database',
      ttlMs: undefined,
      maxMessages: DEFAULT_MAX_SESSION_MESSAGES,
    });
    expect(result.checkpoints).toEqual({
      backend: 'database',
      ttlMs: undefined,
    });
    expect(result.redis).toBeUndefined();
  });

  it('rejects unknown backend names', () => {
    expect(() =>
      readRuntimeStoresConfig(configWith({ sessions: { backend: 'memcache' } })),
    ).toThrow(/unsupported backend 'memcache'/);
  });

  it('requires a Redis connection when a store selects the redis backend', () => {
    expect(() =>
      readRuntimeStoresConfig(configWith({ checkpoints: { backend: 'redis' } })),
    ).toThrow(/redis\.connection' is required/);
  });

  it('reads the Redis connection and per-store tuning values', () => {
    const result = readRuntimeStoresConfig(
      configWith({
        sessions: { backend: 'redis', ttlMs: 60000, maxMessages: 25 },
        checkpoints: { backend: 'redis', ttlMs: 120000 },
        redis: { connection: 'rediss://cache.example.com:6380' },
      }),
    );

    expect(result.redis).toEqual({
      connection: 'rediss://cache.example.com:6380',
      keyPrefix: DEFAULT_REDIS_KEY_PREFIX,
    });
    expect(result.sessions).toEqual({
      backend: 'redis',
      ttlMs: 60000,
      maxMessages: 25,
    });
    expect(result.checkpoints).toEqual({
      backend: 'redis',
      ttlMs: 120000,
    });
  });

  it('honors an explicit Redis key prefix', () => {
    const result = readRuntimeStoresConfig(
      configWith({
        sessions: { backend: 'redis' },
        redis: { connection: 'redis://localhost:6379', keyPrefix: 'crew' },
      }),
    );

    expect(result.redis?.keyPrefix).toBe('crew');
  });
});
