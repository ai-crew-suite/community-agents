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
import { createScaffolderGuardrailAgent } from './agent';
import { readScaffolderGuardrailConfig } from './config';
import { GuardrailGraph } from './workflow/GuardrailGraph';

/** Registers the advisory session-based Scaffolder guardrail agent with AI Core. */
export const scaffolderGuardrailModule = createBackendModule({
  pluginId: 'ai-core',
  moduleId: 'agent-scaffolder-ai-guardrail-agent',
  register(env) {
    env.registerInit({
      deps: {
        config: coreServices.rootConfig,
        logger: coreServices.logger,
        agents: agentExtensionPoint,
        triggers: triggerExtensionPoint,
        workflows: workflowRunnerExtensionPoint
      },
      async init({ config, logger, agents, triggers, workflows }) {
        const resolved = readScaffolderGuardrailConfig(config);

        workflows.registerRunner(new GuardrailGraph(resolved));

        const agent = createScaffolderGuardrailAgent(resolved);
        agents.addAgent(agent);

        for (const trigger of agent.triggers ?? []) {
          triggers.addTrigger(trigger);
        }

        logger.info('Registered advisory Scaffolder guardrail workflow');
      }
    });
  }
});

export default scaffolderGuardrailModule;
