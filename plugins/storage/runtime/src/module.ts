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
import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import { runtimeStoreExtensionPoint } from '@ai-crew-suite/plugin-kernel-node';
import { createAgentRuntimeStores } from './service';

/**
 * Agent runtime persistence backend module for the AI Core backend plugin.
 *
 * The module assembles the agent runtime stores from `ai.runtime.stores`
 * configuration and registers them with the AI backend through the runtime
 * store extension point. Run records, approvals, artifacts, and audit entries
 * are always persisted through the Backstage core database service; sessions
 * and checkpoints can optionally be redirected to a dedicated Redis
 * connection.
 *
 * @public
 */
export const aiCoreBackendModuleRuntimeStore = createBackendPlugin({
  pluginId: 'databases-runtime',
  register(env) {
    env.registerInit({
      deps: {
        config: coreServices.rootConfig,
        database: coreServices.database,
        logger: coreServices.logger,
        runtimeStores: runtimeStoreExtensionPoint,
      },
      async init({ config, database, logger, runtimeStores }) {
        const stores = await createAgentRuntimeStores({
          config,
          database,
          logger,
        });

        runtimeStores.setSessionStore(stores.sessionStore);
        runtimeStores.setCheckpointStore(stores.checkpointStore);
        runtimeStores.setRunStore(stores.runStore);
        runtimeStores.setArtifactSink(stores.artifactSink);
        runtimeStores.setAuditLogSink(stores.auditLogSink);
      },
    });
  },
});

export default aiCoreBackendModuleRuntimeStore;
