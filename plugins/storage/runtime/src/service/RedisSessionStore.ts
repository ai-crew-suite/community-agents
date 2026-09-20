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
import { randomUUID } from 'crypto';
import type { Redis } from 'ioredis';
import type {
  SessionMessage,
  SessionStore,
} from '@ai-crew-suite/plugin-kernel-node';

/**
 * Options controlling Redis-backed session persistence.
 */
export interface RedisSessionStoreOptions {
  /** Prefix prepended to every key written by this store. */
  keyPrefix: string;
  /**
   * Optional TTL in milliseconds applied to session keys and refreshed on
   * every write, giving sessions sliding expiration.
   */
  ttlMs?: number;
  /**
   * Maximum number of messages retained per session. The oldest messages are
   * trimmed first so cached conversation windows stay bounded.
   */
  maxMessages: number;
}

/**
 * Redis-backed implementation of the session persistence contract.
 *
 * Each session is stored as a metadata record and a single JSON array of
 * messages. Appends use a read-modify-write cycle without locking, which is
 * safe for the runtime's access pattern: a session is written by one run at a
 * time.
 */
export class RedisSessionStore implements SessionStore {
  constructor(
    private readonly redis: Redis,
    private readonly options: RedisSessionStoreOptions,
  ) {}

  private metaKey(sessionId: string): string {
    return `${this.options.keyPrefix}:session:${sessionId}:meta`;
  }

  private messagesKey(sessionId: string): string {
    return `${this.options.keyPrefix}:session:${sessionId}:messages`;
  }

  private async writeJson(key: string, value: unknown): Promise<void> {
    const serialized = JSON.stringify(value);
    if (this.options.ttlMs !== undefined) {
      await this.redis.set(key, serialized, 'PX', this.options.ttlMs);
      return;
    }
    await this.redis.set(key, serialized);
  }

  private async readJson<T>(key: string): Promise<T | undefined> {
    const raw = await this.redis.get(key);
    return raw === null ? undefined : (JSON.parse(raw) as T);
  }

  /**
   * Creates a persisted conversation session for an agent and optional user.
   *
   * @returns The generated session ID.
   */
  async createSession(agentId: string, userRef?: string): Promise<string> {
    const id = randomUUID();
    await this.writeJson(this.metaKey(id), {
      agentId,
      userRef: userRef ?? null,
      createdAt: new Date().toISOString(),
    });
    await this.writeJson(this.messagesKey(id), []);
    return id;
  }

  /**
   * Appends a message to an existing session, trimming the retained window to
   * the configured maximum message count.
   */
  async appendMessage(sessionId: string, message: SessionMessage): Promise<void> {
    const key = this.messagesKey(sessionId);
    const messages = (await this.readJson<SessionMessage[]>(key)) ?? [];
    messages.push({
      ...message,
      createdAt: message.createdAt ?? new Date().toISOString(),
    });
    await this.writeJson(key, messages.slice(-this.options.maxMessages));
  }

  /**
   * Lists the most recent messages for a session in chronological order.
   */
  async listMessages(sessionId: string, limit = 20): Promise<SessionMessage[]> {
    const messages =
      (await this.readJson<SessionMessage[]>(this.messagesKey(sessionId))) ?? [];
    return messages.slice(-limit);
  }
}
