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
import type { CheckpointStore } from '@ai-crew-suite/plugin-kernel-node';

/**
 * Options controlling Redis-backed checkpoint persistence.
 */
export interface RedisCheckpointStoreOptions {
  /** Prefix prepended to every key written by this store. */
  keyPrefix: string;
  /**
   * Optional TTL in milliseconds applied to checkpoint keys and refreshed on
   * every save, giving checkpoints sliding expiration.
   */
  ttlMs?: number;
}

/**
 * Redis-backed implementation of the checkpoint persistence contract.
 *
 * Checkpoints are opaque JSON blobs keyed by run ID, which maps directly onto
 * Redis key-value semantics. Note that a checkpoint lost to expiry or eviction
 * makes its run non-resumable; the run lifecycle record itself lives in the
 * SQL store, so affected runs degrade to a restartable error state.
 */
export class RedisCheckpointStore implements CheckpointStore {
  constructor(
    private readonly redis: Redis,
    private readonly options: RedisCheckpointStoreOptions,
  ) {}

  private key(runId: string): string {
    return `${this.options.keyPrefix}:checkpoint:${runId}`;
  }

  /**
   * Saves or replaces resumable orchestration state for a run.
   */
  async save(runId: string, state: unknown): Promise<void> {
    const serialized = JSON.stringify(state);
    if (this.options.ttlMs !== undefined) {
      await this.redis.set(this.key(runId), serialized, 'PX', this.options.ttlMs);
      return;
    }
    await this.redis.set(this.key(runId), serialized);
  }

  /**
   * Loads resumable orchestration state for a run when a checkpoint exists.
   */
  async load<T = unknown>(runId: string): Promise<T | undefined> {
    const raw = await this.redis.get(this.key(runId));
    return raw === null ? undefined : (JSON.parse(raw) as T);
  }
}
