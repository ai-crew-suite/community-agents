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
import { readVcsConfig } from './config';
import {
  toolExtensionPoint,
  VcsDriver,
  vcsDriversExtensionPoint,
} from '@ai-crew-suite/plugin-kernel-node';
import { createVcsTools } from './tools';

/**
 * VCS backend module for the AI Core backend plugin. Supports open-ended driver
 * registrations via Extension Points.
 */
export const aiCoreBackendModuleVcs = createBackendPlugin({
  pluginId: 'tools-vcs',
  register(env) {
    // 1. Maintain an internal module-scoped map of registered drivers
    const drivers = new Map<string, VcsDriver>();

    // 2. Expose the Extension Point interface to the Backstage framework
    env.registerExtensionPoint(vcsDriversExtensionPoint, {
      registerDriver(driver) {
        drivers.set(driver.providerId, driver);
      },
    });

    env.registerInit({
      deps: {
        config: coreServices.rootConfig,
        logger: coreServices.logger,
        urlReader: coreServices.urlReader,
        tools: toolExtensionPoint,
      },
      async init({ config, logger, tools }) {
        const vcsConfig = readVcsConfig(config);

        // 3. Resolve the driver dictated by the user's config completely from the dynamic Map
        const driver = drivers.get(vcsConfig.provider);

        if (!driver) {
          throw new Error(
            `No driver registered for VCS identifier '${vcsConfig.provider}'. Ensure the matching @ai-crew-suite/plugin-kernel-backend-module-vcs-<provider> package is imported in your backend index.ts file.`
          );
        }
        logger.info(
          `Initializing active VCS agent wrapper utilizing registered driver: '${driver.providerId}'`,
        );

        // 4. Restore the tools registration loop to expose your tools to the main AI plugin
        for (const tool of createVcsTools({ driver, logger })) {
          tools.addTool(tool);
        }
      },
    });
  },
});

export default aiCoreBackendModuleVcs;
