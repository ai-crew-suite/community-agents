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
import { coreServices, createBackendPlugin } from '@backstage/backend-plugin-api';
import {
  ObservabilityDriver,
  observabilityDriversExtensionPoint,
  toolExtensionPoint,
} from '@ai-crew-suite/plugin-kernel-node';
import { readObservabilityConfig } from './config';
import { createObservabilityTools } from './tools';

/**
 * Observability backend module for the AI Core backend plugin.
 *
 * The module owns the provider-neutral telemetry tool surface and resolves the
 * active driver from the registry populated by sibling `-<provider>` modules at
 * boot time.
 */
export const toolObservabilityPlugin = createBackendPlugin({
  pluginId: 'tools-observability',
  register(env) {
    // 1. Maintain an internal module-scoped map of registered drivers
    const drivers = new Map<string, ObservabilityDriver>();

    // 2. Expose the Extension Point interface to the Backstage framework
    env.registerExtensionPoint(observabilityDriversExtensionPoint, {
      registerDriver(driver) {
        drivers.set(driver.providerId, driver);
      },
    });

    env.registerInit({
      deps: {
        config: coreServices.rootConfig,
        logger: coreServices.logger,
        tools: toolExtensionPoint,
      },
      async init({ config, logger, tools }) {
        const { provider } = readObservabilityConfig(config);

        // 3. Resolve the driver dictated by config completely from the runtime Map
        const driver = drivers.get(provider);
        if (!driver) {
          throw new Error(
            `No observability driver registered for identifier '${provider}'. ` +
              `Ensure the matching @ai-crew-suite/plugin-kernel-backend-module-observability-${provider} package is imported in your backend index.ts file.`,
          );
        }

        logger.info(
          `Initializing active observability agent wrapper utilizing registered driver: '${driver.providerId}'`,
        );

        // 4. Mount the normalized tools inside the central execution registry
        for (const tool of createObservabilityTools({ driver, logger })) {
          tools.addTool(tool);
        }
      },
    });
  },
});

export default toolObservabilityPlugin;
