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
  KubernetesDiagnosticsDriver,
  kubernetesDiagnosticsDriversExtensionPoint,
  toolExtensionPoint,
} from '@ai-crew-suite/plugin-kernel-node';
import { readKubernetesConfig } from './config';
import { createKubernetesDiagnosticsTools } from './tools';

/**
 * Kubernetes diagnostics backend module for the AI Core backend plugin.
 */
export const aiCoreBackendModuleKubernetes = createBackendPlugin({
  pluginId: 'tools-kubernetes',
  register(env) {
    const drivers = new Map<string, KubernetesDiagnosticsDriver>();

    env.registerExtensionPoint(kubernetesDiagnosticsDriversExtensionPoint, {
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
        const { provider } = readKubernetesConfig(config);
        const driver = drivers.get(provider);
        if (!driver) {
          throw new Error(
            `No Kubernetes diagnostics driver registered for identifier '${provider}'. ` +
              `Ensure the matching Kubernetes diagnostics driver module is imported in your backend index.ts file.`,
          );
        }

        logger.info(
          `Initializing Kubernetes diagnostics tools with registered driver: '${driver.providerId}'`,
        );

        for (const tool of createKubernetesDiagnosticsTools({ driver, logger })) {
          tools.addTool(tool);
        }
      },
    });
  },
});

export default aiCoreBackendModuleKubernetes;
