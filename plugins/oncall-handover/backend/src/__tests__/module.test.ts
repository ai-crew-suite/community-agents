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
import { createBackendPlugin } from '@backstage/backend-plugin-api';
import { mockServices, startTestBackend } from '@backstage/backend-test-utils';
import {
  agentExtensionPoint,
  triggerExtensionPoint,
  workflowRunnerExtensionPoint,
  type AgentExtensionPoint,
  type TriggerExtensionPoint,
  type WorkflowRunnerExtensionPoint,
} from '@ai-crew-suite/plugin-kernel-node';
import { describe, expect, it, vi } from 'vitest';
import { oncallHandoverModule } from '../module';

const points = {
  agents: { addAgent: vi.fn() },
  triggers: { addTrigger: vi.fn() },
  workflows: { registerRunner: vi.fn() },
};

/**
 * Mock core AI container simulating the Backstage system framework orchestration.
 * Registers spying stubs across critical extension point handlers.
 */
const host = createBackendPlugin({
  pluginId: 'ai-core',
  register(env) {
    env.registerExtensionPoint(agentExtensionPoint, points.agents as unknown as AgentExtensionPoint);
    env.registerExtensionPoint(triggerExtensionPoint, points.triggers as unknown as TriggerExtensionPoint);
    env.registerExtensionPoint(workflowRunnerExtensionPoint, points.workflows as unknown as WorkflowRunnerExtensionPoint);
    env.registerInit({
      deps: {},
      async init() {},
    });
  },
});

describe('oncallHandoverModule', () => {
  /**
   * Assures that during module initialization, the on-call framework accurately binds
   * its core runner engine, automated agent parameters, and chronological event schedulers.
   */
  it('registers its runner, read-only agent, and triggers', async () => {
    await startTestBackend({
      features: [
        host,
        oncallHandoverModule,
        mockServices.rootConfig.factory({
          data: {
            ai: {
              agents: {
                oncallHandover: { model: 'oncall-handover' },
              },
            },
          },
        }),
        mockServices.logger.factory(),
        mockServices.scheduler.factory(),
        mockServices.discovery.factory(),
        mockServices.auth.factory(),
      ],
    });

    // Verify Workflow runner definition
    expect(points.workflows.registerRunner.mock.calls[0][0].id).toBe('oncall-handover');

    // Verify Agent composition properties
    const agent = points.agents.addAgent.mock.calls[0][0];
    expect(agent).toMatchObject({
      id: 'oncall-handover-assistant',
      memory: 'none',
      modelRef: 'oncall-handover',
    });
    expect(agent.toolIds).toHaveLength(11);

    // Verify Schedule triggers
    expect(points.triggers.addTrigger).toHaveBeenCalledTimes(2);
  });
});
