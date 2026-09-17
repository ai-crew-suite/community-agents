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
import { createExtensionPoint } from '@backstage/backend-plugin-api';
import type {
  ArtifactSink,
  AuditLogSink,
  CheckpointStore,
  RunStore,
  SessionStore,
  StateSerializer,
  UsageSink,
} from '../types';

/**
 * Extension point that allows storage providers (e.g., PostgreSQL, Redis, local memory)
 * to attach underlying persistence engines to the agentic workflow execution layer.
 *
 * It manages the operational lifecycle state of your 18 agentic plugins—handling live session histories,
 * execution checkpoints, structured run telemetry, artifact streaming, audit logs, and cost/usage counters.
 */
export interface RuntimeStoreExtensionPoint {
  setSessionStore(store: SessionStore): void;
  setCheckpointStore(store: CheckpointStore): void;
  setRunStore(store: RunStore): void;
  setArtifactSink(sink: ArtifactSink): void;
  setAuditLogSink(sink: AuditLogSink): void;
  setUsageSink?(sink: UsageSink): void;
  setStateSerializer?(serializer: StateSerializer): void;
}

export const runtimeStoreExtensionPoint =
  createExtensionPoint<RuntimeStoreExtensionPoint>({
    id: 'databases-runtime.stores',
  });
