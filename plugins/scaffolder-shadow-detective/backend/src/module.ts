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
import { createShadowDetectiveAgent } from './agent';
import { readShadowDetectiveConfig } from './config';
import { CatalogBindingIndex } from './services/CatalogBindingIndex';
import { ReconciliationGraph } from './workflow/ReconciliationGraph';

/** Registers report-only cloud shadow reconciliation with AI Core. */
export const shadowDetectiveModule = createBackendModule({
  pluginId: 'ai-core',
  moduleId: 'agent-scaffolder-ai-shadow-detective',
  register(env) {
    env.registerInit({
      deps: {
        config: coreServices.rootConfig,
        logger: coreServices.logger,
        discovery: coreServices.discovery,
        agents: agentExtensionPoint,
        triggers: triggerExtensionPoint,
        workflows: workflowRunnerExtensionPoint,
      },
      async init({ config, logger, discovery, agents, triggers, workflows }) {
        const resolved = readShadowDetectiveConfig(config);
        const catalog = new CatalogClient({ discoveryApi: discovery });

        workflows.registerRunner(
          new ReconciliationGraph(
            resolved,
            new CatalogBindingIndex(catalog, resolved.annotation),
          ),
        );

        const agent = createShadowDetectiveAgent(resolved);

        agents.addAgent(agent);

        for (const trigger of agent.triggers ?? [])
          triggers.addTrigger(trigger);

        logger.info(
          'Registered report-only shadow resource reconciliation workflow',
        );
      },
    });
  },
});
export default shadowDetectiveModule;
