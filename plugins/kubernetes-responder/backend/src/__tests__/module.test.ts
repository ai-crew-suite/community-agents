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
  AgentExtensionPoint,
  TriggerExtensionPoint,
  WorkflowRunnerExtensionPoint,
  agentExtensionPoint,
  triggerExtensionPoint,
  workflowRunnerExtensionPoint,
} from '@ai-crew-suite/plugin-kernel-node';
import { describe, expect, it, vi } from 'vitest';
import { kubernetesAiResponderModule } from '../module';
import { KUBERNETES_AI_RESPONDER_TOOL_IDS } from '../agent';
import { KUBERNETES_INCIDENT_TRIAGE_WORKFLOW_ID } from '../workflow/IncidentTriageGraph';

const configData = {
  ai: {
    agents: {
      kubernetesAiResponder: {
        model: 'incident-triage',
      },
    },
  },
};

const createHostPlugin = (points: {
  agents: { addAgent: ReturnType<typeof vi.fn> };
  triggers: { addTrigger: ReturnType<typeof vi.fn> };
  workflows: { registerRunner: ReturnType<typeof vi.fn> };
}) =>
  createBackendPlugin({
    pluginId: 'ai-core',
    register(env) {
      env.registerExtensionPoint(
        agentExtensionPoint,
        points.agents as unknown as AgentExtensionPoint,
      );
      env.registerExtensionPoint(
        triggerExtensionPoint,
        points.triggers as unknown as TriggerExtensionPoint,
      );
      env.registerExtensionPoint(
        workflowRunnerExtensionPoint,
        points.workflows as unknown as WorkflowRunnerExtensionPoint,
      );
      env.registerInit({ deps: {}, async init() {} });
    },
  });

const start = (points: {
  agents: { addAgent: ReturnType<typeof vi.fn> };
  triggers: { addTrigger: ReturnType<typeof vi.fn> };
  workflows: { registerRunner: ReturnType<typeof vi.fn> };
}) =>
  startTestBackend({
    features: [
      createHostPlugin(points),
      kubernetesAiResponderModule,
      mockServices.rootConfig.factory({ data: configData }),
      mockServices.logger.factory(),
    ],
  });

describe('kubernetesAiResponderModule', () => {
  it('registers the workflow runner, agent, and trigger binding', async () => {
    const points = {
      agents: { addAgent: vi.fn() },
      triggers: { addTrigger: vi.fn() },
      workflows: { registerRunner: vi.fn() },
    };

    await start(points);

    expect(points.workflows.registerRunner).toHaveBeenCalledTimes(1);
    expect(points.workflows.registerRunner.mock.calls[0][0].id).toBe(
      KUBERNETES_INCIDENT_TRIAGE_WORKFLOW_ID,
    );

    expect(points.agents.addAgent).toHaveBeenCalledTimes(1);
    const agent = points.agents.addAgent.mock.calls[0][0];
    expect(agent.id).toBe('kubernetes-ai-responder');
    expect(agent.modelRef).toBe('incident-triage');
    expect(agent.workflowRef).toBe(KUBERNETES_INCIDENT_TRIAGE_WORKFLOW_ID);
    expect(agent.toolIds).toEqual([...KUBERNETES_AI_RESPONDER_TOOL_IDS]);
    expect(agent.toolIds).toHaveLength(6);

    expect(points.triggers.addTrigger).toHaveBeenCalledWith({
      id: 'kubernetes-incident-webhook',
      source: 'alertmanager',
      agentId: 'kubernetes-ai-responder',
    });
  });

  it('fails startup when responder configuration is missing', async () => {
    const points = {
      agents: { addAgent: vi.fn() },
      triggers: { addTrigger: vi.fn() },
      workflows: { registerRunner: vi.fn() },
    };

    await expect(
      startTestBackend({
        features: [
          createHostPlugin(points),
          kubernetesAiResponderModule,
          mockServices.rootConfig.factory({ data: {} }),
          mockServices.logger.factory(),
        ],
      }),
    ).rejects.toThrow(/kubernetesAiResponder/);
  });
});
