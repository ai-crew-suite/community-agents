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
import { coreServices, createBackendModule } from '@backstage/backend-plugin-api';
import { CatalogClient } from '@backstage/catalog-client';
import {
  agentExtensionPoint,
  triggerExtensionPoint,
  workflowRunnerExtensionPoint,
} from '@ai-crew-suite/plugin-kernel-node';
import { createCatalogAiInsightsAgent } from './agent';
import { readCatalogAiInsightsConfig } from './config';
import { registerNightlyScanTask } from './scheduler/nightlyScan';
import { CatalogContextResolver } from './services/CatalogContextResolver';
import { CatalogInsightsGraph } from './workflow/CatalogInsightsGraph';

/**
 * Backend module that registers the catalog AI insights agent with AI Core:
 * wires the `CatalogInsightsGraph` workflow runner, the insights agent, its
 * triggers, and (when enabled) the nightly scan scheduler task.
 */
export const catalogAiInsightsModule = createBackendModule({
  pluginId: 'ai-core',
  moduleId: 'agent-catalog-ai-insights',
  register(env) {
    env.registerInit({
      deps: {
        config: coreServices.rootConfig,
        logger: coreServices.logger,
        scheduler: coreServices.scheduler,
        discovery: coreServices.discovery,
        auth: coreServices.auth,
        agents: agentExtensionPoint,
        triggers: triggerExtensionPoint,
        workflows: workflowRunnerExtensionPoint,
      },
      async init({
        config,
        logger,
        scheduler,
        discovery,
        auth,
        agents,
        triggers,
        workflows,
      }) {
        const insightsConfig = readCatalogAiInsightsConfig(config);

        const catalogClient = new CatalogClient({ discoveryApi: discovery });
        const resolver = new CatalogContextResolver({
          client: catalogClient,
          getToken: async () => {
            const { token } = await auth.getPluginRequestToken({
              onBehalfOf: await auth.getOwnServiceCredentials(),
              targetPluginId: 'catalog',
            });
            return token;
          },
        });

        workflows.registerRunner(
          new CatalogInsightsGraph({
            resolver,
            maxContextItems: insightsConfig.maxContextItems,
            maxRetrievalChunks: insightsConfig.maxRetrievalChunks,
            maxLogResults: insightsConfig.maxLogResults,
            maxToolInvocations: insightsConfig.maxToolInvocations,
            lookbackMinutes: insightsConfig.lookbackMinutes,
          }),
        );
        const agent = createCatalogAiInsightsAgent(insightsConfig);
        agents.addAgent(agent);
        for (const trigger of agent.triggers ?? []) {
          triggers.addTrigger(trigger);
        }

        if (insightsConfig.scan.enabled) {
          registerNightlyScanTask({
            scheduler,
            discovery,
            auth,
            logger,
            resolver,
            config: insightsConfig.scan,
          });
          logger.info('Registered catalog AI insights nightly scan task');
        }
        logger.info('Registered catalog AI insights workflow');
      },
    });
  },
});

export default catalogAiInsightsModule;
