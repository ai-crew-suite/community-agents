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
import { createRfcAdrReviewerAgent } from './agent';
import { readRfcAdrReviewerConfig } from './config';
import { ReviewGraph } from './workflow/ReviewGraph';

/**
 * Registers the read-only parallel RFC/ADR reviewer and its manual agent trigger.
 * Integrates directly as a backend extension module for the centralized `ai-core` plugin system.
 */
export const rfcAdrReviewerModule = createBackendModule({
  pluginId: 'ai-core',
  moduleId: 'agent-rfc-adr-ai-reviewer',
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
        const reviewerConfig = readRfcAdrReviewerConfig(config);

        // Bind the parallel multi-channel evaluation state graph
        workflows.registerRunner(new ReviewGraph(reviewerConfig));

        // Mount the underlying automated compliance and architecture tool bindings
        const agent = createRfcAdrReviewerAgent(reviewerConfig);
        agents.addAgent(agent);

        // Register default reactive triggers managed by the core runtime
        for (const trigger of agent.triggers ?? []) {
          triggers.addTrigger(trigger);
        }

        logger.info('Registered draft-only RFC/ADR reviewer workflow');
      },
    });
  },
});

export default rfcAdrReviewerModule;
