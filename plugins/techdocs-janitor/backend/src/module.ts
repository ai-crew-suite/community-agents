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
import { createTechdocsJanitorAgent } from './agent';
import { readTechdocsJanitorConfig } from './config';
import { CatalogResolver } from './services/CatalogResolver';
import { JanitorGraph } from './workflow/JanitorGraph';

/** Registers deterministic read-only TechDocs audits with AI Core. */
export const techdocsJanitorModule = createBackendModule({
  pluginId: 'ai-core',
  moduleId: 'agent-techdocs-ai-janitor',
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
        const resolved = readTechdocsJanitorConfig(config);
        const client = new CatalogClient({ discoveryApi: discovery });

        const resolver = new CatalogResolver(async entityRef => {
          const token = (
            await auth.getPluginRequestToken({
              onBehalfOf: await auth.getOwnServiceCredentials(),
              targetPluginId: 'catalog',
            })
          ).token;

          const entity = await client.getEntityByRef(entityRef, { token });

          if (!entity) return undefined;

          return {
            ref: entityRef,
            kind: entity.kind,
            namespace: entity.metadata.namespace ?? 'default',
            name: entity.metadata.name,
            owner: entity.spec?.owner as string | undefined,
            annotations: entity.metadata.annotations ?? {},
            tags: entity.metadata.tags ?? [],
          };
        });

        workflows.registerRunner(new JanitorGraph(resolved, resolver as never));

        const agent = createTechdocsJanitorAgent(resolved);

        agents.addAgent(agent);

        for (const trigger of agent.triggers ?? [])
          triggers.addTrigger(trigger);

        logger.info('Registered read-only TechDocs janitor workflow');
      },
    });
  },
});

export default techdocsJanitorModule;
