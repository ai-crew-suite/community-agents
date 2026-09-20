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
import { createOncallHandoverAgent } from './agent';
import { readOncallHandoverConfig } from './config';
import { HandoverGraph } from './workflow/HandoverGraph';
import { registerShiftSchedule } from './scheduler/shiftSchedule';

/**
 * Registers the on-call handover workflow, agent triggers, and optional shift scheduler.
 * Integrates directly as a backend extension module for the centralized `ai-core` system.
 */
export const oncallHandoverModule = createBackendModule({
  pluginId: 'ai-core',
  moduleId: 'agent-oncall-handover-assistant',
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
      async init({ config, logger, scheduler, discovery, auth, agents, triggers, workflows }) {
        const resolved = readOncallHandoverConfig(config);

        // Bind the pure pipeline state evaluation graph
        workflows.registerRunner(new HandoverGraph(resolved));

        // Mount the underlying foundational LLM utility tool bindings
        const agent = createOncallHandoverAgent(resolved);
        agents.addAgent(agent);

        // Register default reactive triggers managed by the core runtime
        for (const trigger of agent.triggers ?? []) {
          triggers.addTrigger(trigger);
        }

        // Establish background cron synchronization tasks if specified
        if (resolved.schedule.enabled) {
          registerShiftSchedule({ scheduler, discovery, auth, logger, config: resolved });
        }

        logger.info('Registered on-call handover workflow');
      },
    });
  },
});

export default oncallHandoverModule;
