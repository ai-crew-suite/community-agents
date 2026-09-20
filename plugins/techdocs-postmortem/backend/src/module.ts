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
import {
  agentExtensionPoint,
  triggerExtensionPoint,
  workflowRunnerExtensionPoint,
} from '@ai-crew-suite/plugin-kernel-node';
import { createTechdocsPostmortemAgent } from './agent';
import { readPostmortemConfig } from './config';
import { PostmortemGraph } from './workflow/PostmortemGraph';

/** Registers read-only postmortem timeline drafting with AI Core. */
export const techdocsPostmortemModule = createBackendModule({
  pluginId: 'ai-core',
  moduleId: 'agent-techdocs-ai-postmortem',
  register(env) {
    env.registerInit({
      deps: {
        config: coreServices.rootConfig,
        logger: coreServices.logger,
        agents: agentExtensionPoint,
        triggers: triggerExtensionPoint,
        workflows: workflowRunnerExtensionPoint,
      },
      async init({ config, logger, agents, triggers, workflows }) {
        const resolved = readPostmortemConfig(config);

        workflows.registerRunner(new PostmortemGraph(resolved));

        const agent = createTechdocsPostmortemAgent(resolved);

        agents.addAgent(agent);

        for (const trigger of agent.triggers ?? [])
          triggers.addTrigger(trigger);

        logger.info('Registered read-only TechDocs postmortem workflow');
      },
    });
  },
});
export default techdocsPostmortemModule;
