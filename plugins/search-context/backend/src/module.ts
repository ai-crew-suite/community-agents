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
  createBackendModule,
} from '@backstage/backend-plugin-api';
import { CatalogClient } from '@backstage/catalog-client';
import {
  agentExtensionPoint,
  triggerExtensionPoint,
  workflowRunnerExtensionPoint,
} from '@ai-crew-suite/plugin-kernel-node';
import { createSearchContextAgent } from './agent';
import { readSearchContextConfig } from './config';
import { CatalogResolver } from './services/CatalogResolver';
import { ImpactGraph } from './workflow/ImpactGraph';

/** Registers the bounded, read-only cross-service impact workflow with AI Core. */
export const searchContextModule = createBackendModule({
  pluginId: 'ai-core',
  moduleId: 'agent-search-ai-context',
  register(env) {
    env.registerInit({
      deps: {
        config: coreServices.rootConfig,
        logger: coreServices.logger,
        discovery: coreServices.discovery,
        auth: coreServices.auth,
        agents: agentExtensionPoint,
        triggers: triggerExtensionPoint,
        workflows: workflowRunnerExtensionPoint,
      },
      async init({
        config,
        logger,
        discovery,
        auth,
        agents,
        triggers,
        workflows,
      }) {
        const resolved = readSearchContextConfig(config);
        const client = new CatalogClient({ discoveryApi: discovery });

        const resolver = new CatalogResolver({
          client,
          getToken: async () =>
            (
              await auth.getPluginRequestToken({
                onBehalfOf: await auth.getOwnServiceCredentials(),
                targetPluginId: 'catalog',
              })
            ).token,
        });

        workflows.registerRunner(new ImpactGraph(resolved, resolver));

        const agent = createSearchContextAgent(resolved);

        agents.addAgent(agent);

        for (const trigger of agent.triggers ?? [])
          triggers.addTrigger(trigger);

        logger.info('Registered read-only search context impact workflow');
      },
    });
  },
});

export default searchContextModule;
