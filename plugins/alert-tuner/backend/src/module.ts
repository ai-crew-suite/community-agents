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
  workflowRunnerExtensionPoint,
} from '@ai-crew-suite/plugin-kernel-node';
import { createAlertAiTunerAgent } from './agent';
import { readAlertAiTunerConfig } from './config';
import { registerWeeklySweep } from './scheduler/weeklySweep';
import { AlertTunerGraph } from './workflow/AlertTunerGraph';

/**
 * Registers the propose-only alert fatigue tuner, its triggers, and the optional
 * weekly noise sweep. Installs as a backend extension module of the shared
 * `ai-core` plugin.
 */
export const alertAiTunerModule = createBackendModule({
  pluginId: 'alert-tuner',
  moduleId: 'backend',
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
        const resolved = readAlertAiTunerConfig(config);

        // Bind the deterministic observe/analyze/correlate/locate/patch graph
        workflows.registerRunner(new AlertTunerGraph(resolved));

        // Mount the read-only incident, metrics, and repository tool bindings
        const agent = createAlertAiTunerAgent(resolved);

        agents.addAgent(agent);

        // Register default reactive triggers managed by the core runtime
        for (const trigger of agent.triggers ?? []) {
          triggers.addTrigger(trigger);
        }

        // Establish the background weekly noise sweep when explicitly enabled
        if (resolved.sweep.enabled) {
          registerWeeklySweep({ scheduler, discovery, auth, logger, config: resolved });
        }

        logger.info('Registered propose-only alert fatigue tuner workflow');
      },
    });
  },
});

export default alertAiTunerModule;
