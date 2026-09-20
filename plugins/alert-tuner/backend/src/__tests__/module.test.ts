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
import { alertAiTunerModule } from '../module';

/** Boots the module against stub extension points and the supplied config. */
const bootModule = async (alertAiTuner: { model?: string }) => {
  const points = {
    agents: { addAgent: vi.fn() },
    triggers: { addTrigger: vi.fn() },
    workflows: { registerRunner: vi.fn() },
  };

  const host = createBackendPlugin({
    pluginId: 'ai-core',
    register(env) {
      env.registerExtensionPoint(
        agentExtensionPoint,
        points.agents as unknown as AgentExtensionPoint
      );
      env.registerExtensionPoint(
        triggerExtensionPoint,
        points.triggers as unknown as TriggerExtensionPoint
      );
      env.registerExtensionPoint(
        workflowRunnerExtensionPoint,
        points.workflows as unknown as WorkflowRunnerExtensionPoint
      );
      env.registerInit({ deps: {}, async init() {} });
    },
  });

  await startTestBackend({
    features: [
      host,
      alertAiTunerModule,
      mockServices.rootConfig.factory({ data: { ai: { agents: { alertAiTuner } } } }),
      mockServices.logger.factory(),
    ],
  });

  return points;
};

describe('alertAiTunerModule', () => {
  /**
   * Boot registration is the contract the AI Core runtime depends on: the
   * tuning runner, the agent profile, and both triggers must all be attached.
   */
  it('registers the tuning runner, agent, and both triggers', async () => {
    const points = await bootModule({ model: 'alert-tuner' });

    expect(points.workflows.registerRunner.mock.calls[0][0].id).toBe('alert-tuning');
    expect(points.agents.addAgent.mock.calls[0][0]).toMatchObject({
      id: 'alert-ai-tuner',
      workflowRef: 'alert-tuning',
      memory: 'none',
    });
    expect(points.triggers.addTrigger).toHaveBeenCalledTimes(2);
  });

  /**
   * The allow-list must advertise only tools that exist today; listing the
   * unbuilt write tool would promise a capability the runtime cannot honor.
   */
  it('advertises only read-only tools while no VCS write tool exists', async () => {
    const points = await bootModule({ model: 'alert-tuner' });
    const toolIds: string[] = points.agents.addAgent.mock.calls[0][0].toolIds;

    expect(toolIds).toContain('incident.alert.history');
    expect(toolIds).toContain('vcs.repository.read_file');
    expect(toolIds).not.toContain('vcs.pull_request.create');
    expect(toolIds.some((id) => id.includes('annotate'))).toBe(false);
  });

  /** A missing config section must fail at boot rather than mid-run. */
  it('fails to boot without the alertAiTuner configuration', async () => {
    await expect(bootModule({})).rejects.toThrow(/alertAiTuner/);
  });
});
