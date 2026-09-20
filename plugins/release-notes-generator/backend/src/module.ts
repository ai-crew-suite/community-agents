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
import { agentExtensionPoint, triggerExtensionPoint, workflowRunnerExtensionPoint } from '@ai-crew-suite/plugin-kernel-node';
import { createReleaseNotesAgent } from './agent';
import { readReleaseNotesConfig } from './config';
import { ReleaseNotesGraph } from './workflow/ReleaseNotesGraph';

/** Registers the draft-only release-notes workflow and its AI Core agent profile. */
export const releaseNotesModule = createBackendModule({
  pluginId: 'ai-core',
  moduleId: 'agent-release-notes-ai-generator',
  register(env) {
    env.registerInit({
      deps: { config: coreServices.rootConfig, logger: coreServices.logger, agents: agentExtensionPoint, triggers: triggerExtensionPoint, workflows: workflowRunnerExtensionPoint },
      async init({ config, logger, agents, triggers, workflows }) {
        const releaseNotesConfig = readReleaseNotesConfig(config);
        workflows.registerRunner(new ReleaseNotesGraph(releaseNotesConfig));
        const agent = createReleaseNotesAgent(releaseNotesConfig);
        agents.addAgent(agent);
        for (const trigger of agent.triggers ?? []) triggers.addTrigger(trigger);
        logger.info('Registered draft-only release-notes workflow');
      },
    });
  },
});

export default releaseNotesModule;
