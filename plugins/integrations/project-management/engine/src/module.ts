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
  ProjectManagementDriver,
  projectManagementDriversExtensionPoint,
  toolExtensionPoint,
} from '@ai-crew-suite/plugin-kernel-node';
import { readProjectManagementConfig } from './config';
import { createProjectManagementTools } from './tools';

/**
 * Project management backend module for the AI Core backend plugin.
 *
 * The module owns the provider-neutral work tracking tool surface and resolves
 * the active driver from the registry populated by sibling `-<provider>`
 * modules at boot time.
 */
export const toolProjectManagementPlugin = createBackendPlugin({
  pluginId: 'tools-project-management',
  register(env) {
    // 1. Maintain an internal module-scoped map of registered drivers
    const drivers = new Map<string, ProjectManagementDriver>();

    // 2. Expose the Extension Point interface to the Backstage framework
    env.registerExtensionPoint(projectManagementDriversExtensionPoint, {
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
        const { provider } = readProjectManagementConfig(config);

        // 3. Resolve the driver dictated by config completely from the runtime Map
        const driver = drivers.get(provider);
        if (!driver) {
          throw new Error(
            `No project management driver registered for identifier '${provider}'. ` +
              `Ensure the matching @ai-crew-suite/plugin-kernel-backend-module-project-management-${provider} package is imported in your backend index.ts file.`,
          );
        }

        logger.info(
          `Initializing active project management agent wrapper utilizing registered driver: '${driver.providerId}'`,
        );

        // 4. Mount the normalized tools inside the central execution registry
        for (const tool of createProjectManagementTools({ driver, logger })) {
          tools.addTool(tool);
        }
      },
    });
  },
});

export default toolProjectManagementPlugin;
