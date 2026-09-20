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
import {
  agentExtensionPoint,
  triggerExtensionPoint,
  workflowRunnerExtensionPoint
} from '@ai-crew-suite/plugin-kernel-node';
import { createScaffolderInfraAgent } from './agent';
import { readScaffolderInfraConfig } from './config';
import { BlueprintResolver } from './services/BlueprintResolver';
import { InfraGraph } from './workflow/InfraGraph';

/** Registers the AI Core non-writing infrastructure preview runner. */
export const scaffolderInfraModule = createBackendModule({
  pluginId: 'ai-core',
  moduleId: 'agent-scaffolder-ai-infra',
  register(env) {
    env.registerInit({
      deps: {
        config: coreServices.rootConfig,
        logger: coreServices.logger,
        urlReader: coreServices.urlReader,
        agents: agentExtensionPoint,
        triggers: triggerExtensionPoint,
        workflows: workflowRunnerExtensionPoint
      },
      async init({ config, logger, urlReader, agents, triggers, workflows }) {
        const resolved = readScaffolderInfraConfig(config);
        const resolver = new BlueprintResolver(urlReader, resolved.sources, resolved.maxBlueprintBytes);

        workflows.registerRunner(new InfraGraph(resolved, resolver));

        const agent = createScaffolderInfraAgent(resolved);
        agents.addAgent(agent);

        for (const trigger of agent.triggers ?? []) {
          triggers.addTrigger(trigger);
        }

        logger.info('Registered Scaffolder infra preview workflow');
      }
    });
  }
});

export default scaffolderInfraModule;
