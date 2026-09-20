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
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RedisSessionStore } from '../RedisSessionStore';

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

const createStore = (
  redis: FakeRedis,
  options?: { ttlMs?: number; maxMessages?: number },
) =>
  new RedisSessionStore(redis as unknown as Redis, {
    keyPrefix: 'ai-core',
    maxMessages: options?.maxMessages ?? 3,
    ttlMs: options?.ttlMs,
  });

const readStoredJson = (redis: FakeRedis, key: string) => {
  const raw = redis.data.get(key);
  expect(raw).toBeDefined();
  return JSON.parse(raw as string);
};

describe('RedisSessionStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates sessions with metadata and an empty message list', async () => {
    const redis = createFakeRedis();
    const store = createStore(redis);

    const sessionId = await store.createSession('agent-a', 'user:default/alice');

    expect(sessionId).toBeTruthy();
    expect(
      readStoredJson(redis, `ai-core:session:${sessionId}:meta`),
    ).toMatchObject({ agentId: 'agent-a', userRef: 'user:default/alice' });
    expect(
      readStoredJson(redis, `ai-core:session:${sessionId}:messages`),
    ).toEqual([]);
  });

  it('appends messages in order, defaults timestamps, and lists a limited window', async () => {
    const redis = createFakeRedis();
    const store = createStore(redis);
    const sessionId = await store.createSession('agent-a');

    await store.appendMessage(sessionId, { role: 'user', content: 'one' });
    await store.appendMessage(sessionId, { role: 'assistant', content: 'two' });
    await store.appendMessage(sessionId, { role: 'user', content: 'three' });
    await store.appendMessage(sessionId, { role: 'assistant', content: 'four' });

    // maxMessages is 3 in this store, so the oldest message was trimmed.
    const messages = await store.listMessages(sessionId);
    expect(messages.map(message => message.content)).toEqual([
      'two',
      'three',
      'four',
    ]);
    expect(messages[0].createdAt).toBeDefined();

    const windowed = await store.listMessages(sessionId, 2);
    expect(windowed.map(message => message.content)).toEqual(['three', 'four']);
  });

  it('applies a sliding TTL to session keys when configured', async () => {
    const redis = createFakeRedis();
    const store = createStore(redis, { ttlMs: 60000 });

    const sessionId = await store.createSession('agent-a');
    await store.appendMessage(sessionId, { role: 'user', content: 'hello' });

    expect(redis.set).toHaveBeenCalledWith(
      `ai-core:session:${sessionId}:meta`,
      expect.any(String),
      'PX',
      60000,
    );
    expect(redis.set).toHaveBeenCalledWith(
      `ai-core:session:${sessionId}:messages`,
      expect.any(String),
      'PX',
      60000,
    );
  });

  it('returns an empty list for unknown sessions', async () => {
    const redis = createFakeRedis();
    const store = createStore(redis);

    await expect(store.listMessages('missing')).resolves.toEqual([]);
  });
});
