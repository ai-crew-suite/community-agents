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
import { startTestBackend, mockServices } from '@backstage/backend-test-utils';
import {
  coreServices,
  createBackendPlugin,
  createServiceFactory,
} from '@backstage/backend-plugin-api';
import type { DatabaseService } from '@backstage/backend-plugin-api';
import type { Knex } from 'knex';
import { runtimeStoreExtensionPoint } from '@ai-crew-suite/plugin-kernel-node';
import { describe, expect, it, vi } from 'vitest';
import { applyDatabaseMigrations } from '../database/migrations';
import { aiCoreBackendModuleRuntimeStore } from '../module';
import { SqlAgentRuntimeStore } from '../service/SqlAgentRuntimeStore';

// The migration runner is mocked so the test backend never loads
// better-sqlite3: its unplugged native binary is compiled for one Node ABI
// at a time and breaks under any other locally installed Node version.
vi.mock('../database/migrations', () => ({
  applyDatabaseMigrations: vi.fn(async () => undefined),
}));

const databaseFactory = createServiceFactory({
  service: coreServices.database,
  deps: {},
  factory: async () =>
    ({
      getClient: vi.fn(async () => ({}) as Knex),
    }) as unknown as DatabaseService,
});

describe('aiCoreBackendModuleRuntimeStore', () => {
  it('applies migrations and registers SQL-backed runtime stores by default', async () => {
    const runtimeStores = {
      setSessionStore: vi.fn(),
      setCheckpointStore: vi.fn(),
      setRunStore: vi.fn(),
      setArtifactSink: vi.fn(),
      setAuditLogSink: vi.fn(),
    };

    // Host stub standing in for plugin-ai-core-backend.
    const mockAiCorePlugin = createBackendPlugin({
      pluginId: 'ai-core',
      register(env) {
        env.registerExtensionPoint(runtimeStoreExtensionPoint, runtimeStores);
        env.registerInit({
          deps: {},
          async init() {
            // Keep this block execution footprint empty as it is just a host stub
          },
        });
      },
    });

    await expect(
      startTestBackend({
        features: [
          mockAiCorePlugin,
          aiCoreBackendModuleRuntimeStore,
          databaseFactory,
          mockServices.rootConfig.factory({ data: {} }),
          mockServices.logger.factory(),
        ],
      }),
    ).resolves.toBeDefined();

    expect(applyDatabaseMigrations).toHaveBeenCalledTimes(1);
    expect(runtimeStores.setSessionStore).toHaveBeenCalledWith(
      expect.any(SqlAgentRuntimeStore),
    );
    expect(runtimeStores.setCheckpointStore).toHaveBeenCalledWith(
      expect.any(SqlAgentRuntimeStore),
    );
    expect(runtimeStores.setRunStore).toHaveBeenCalledWith(
      expect.any(SqlAgentRuntimeStore),
    );
    expect(runtimeStores.setArtifactSink).toHaveBeenCalledWith(
      expect.any(SqlAgentRuntimeStore),
    );
    expect(runtimeStores.setAuditLogSink).toHaveBeenCalledWith(
      expect.any(SqlAgentRuntimeStore),
    );
  });
});
