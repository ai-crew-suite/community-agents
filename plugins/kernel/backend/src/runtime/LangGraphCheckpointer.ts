/**
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
  CheckpointRecord,
  CheckpointStore,
  StateSerializer,
} from '@ai-crew-suite/plugin-kernel-node';

type CheckpointTuple = [id: string, nextNode: string | undefined, state: unknown];

/**
 * Adapter from the AI Core `CheckpointStore` contract to LangGraph's
 * `BaseCheckpointSaver` interface. `thread_id = runId`; `put` is idempotent on
 * (runId, seq) so engine retries cannot double-write.
 */
export class LangGraphCheckpointer {
  constructor(
    private readonly store: CheckpointStore,
    private readonly serializer?: StateSerializer,
  ) {}

  /** Load the latest checkpoint for a thread. */
  async get(runId: string): Promise<CheckpointRecord | undefined> {
    return this.store.getLatest(runId);
  }

  async getTuple(runId: string): Promise<CheckpointTuple | undefined> {
    const record = await this.store.getLatest(runId);
    if (!record) return undefined;
    const restored = this.serializer
      ? await this.serializer.deserialize({
          runId: record.runId,
          seq: record.seq,
          payload: record.state as string | Uint8Array,
          serializerId: this.serializer.serializerId,
          nextNode: record.nextNode,
          stateVersion: record.stateVersion,
          createdAt: record.createdAt,
        })
      : record;
    return [restored.runId, restored.nextNode, restored.state];
  }

  /** Persist a checkpoint at the current graph position. */
  async put(record: CheckpointRecord): Promise<void> {
    const payload = this.serializer
      ? await this.serializer.serialize(record)
      : record;
    // The serializer suspends storage shape; the store receives the checkpoint record.
    await this.store.put(payload as CheckpointRecord);
  }

  /** Full ordered history for replay/debug. */
  async list(runId: string): Promise<CheckpointRecord[]> {
    return this.store.list(runId);
  }

  /** Tombstone a run's checkpoints. */
  async deleteThread(runId: string): Promise<void> {
    await this.store.delete(runId);
  }
}
