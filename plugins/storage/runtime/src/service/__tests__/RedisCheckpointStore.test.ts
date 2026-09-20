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
import type { Redis } from 'ioredis';
import { describe, expect, it, vi } from 'vitest';
import { RedisCheckpointStore } from '../RedisCheckpointStore';

type FakeRedis = {
  data: Map<string, string>;
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
};

const createFakeRedis = (): FakeRedis => {
  const data = new Map<string, string>();
  return {
    data,
    get: vi.fn(async (key: string) => data.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => {
      data.set(key, value);
      return 'OK';
    }),
  };
};

describe('RedisCheckpointStore', () => {
  it('saves and loads checkpoint state for a run', async () => {
    const redis = createFakeRedis();
    const store = new RedisCheckpointStore(redis as unknown as Redis, {
      keyPrefix: 'ai-core',
    });

    await store.save('run-a', { node: 'retrieve', cursor: 3 });

    await expect(store.load('run-a')).resolves.toEqual({
      node: 'retrieve',
      cursor: 3,
    });
    expect(redis.data.has('ai-core:checkpoint:run-a')).toBe(true);
  });

  it('returns undefined when no checkpoint exists for a run', async () => {
    const redis = createFakeRedis();
    const store = new RedisCheckpointStore(redis as unknown as Redis, {
      keyPrefix: 'ai-core',
    });

    await expect(store.load('missing')).resolves.toBeUndefined();
  });

  it('applies a TTL when one is configured', async () => {
    const redis = createFakeRedis();
    const store = new RedisCheckpointStore(redis as unknown as Redis, {
      keyPrefix: 'ai-core',
      ttlMs: 30000,
    });

    await store.save('run-a', { node: 'retrieve' });

    expect(redis.set).toHaveBeenCalledWith(
      'ai-core:checkpoint:run-a',
      expect.any(String),
      'PX',
      30000,
    );
  });
});
