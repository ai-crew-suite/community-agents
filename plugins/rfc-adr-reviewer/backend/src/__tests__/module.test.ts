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
import { rfcAdrReviewerModule } from '../module';

describe('rfcAdrReviewerModule', () => {
  /**
   * Validates that when mounting the extension module under a test backend context,
   * it accurately attaches the critique runner graph, specialized model configurations,
   * and manual triggers to their corresponding core system extension points.
   */
  it('registers the parallel draft reviewer and manual trigger', async () => {
    const points = {
      agents: { addAgent: vi.fn() },
      triggers: { addTrigger: vi.fn() },
      workflows: { registerRunner: vi.fn() },
    };

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

    await startTestBackend({
      features: [
        host,
        rfcAdrReviewerModule,
        mockServices.rootConfig.factory({
          data: {
            ai: {
              agents: {
                rfcAdrReviewer: { model: 'rfc-adr-review' },
              },
            },
          },
        }),
        mockServices.logger.factory(),
      ],
    });

    expect(points.workflows.registerRunner.mock.calls[0][0].id).toBe('rfc-adr-review');
    expect(points.agents.addAgent.mock.calls[0][0]).toMatchObject({
      id: 'rfc-adr-ai-reviewer',
      memory: 'none',
    });
    expect(points.triggers.addTrigger).toHaveBeenCalledTimes(1);
  });
});
