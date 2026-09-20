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
import { createBackendModule, createBackendPlugin } from '@backstage/backend-plugin-api';
import { mockServices, startTestBackend } from '@backstage/backend-test-utils';
import {
  ToolExtensionPoint,
  projectManagementDriversExtensionPoint,
  toolExtensionPoint,
} from '@ai-crew-suite/plugin-kernel-node';
import { describe, expect, it, vi } from 'vitest';
import { aiCoreBackendModuleProjectManagement } from '../module';

const configData = {
  ai: { integrations: { projectManagement: { provider: 'jira' } } },
};

const createHostPlugin = (tools: { addTool: ReturnType<typeof vi.fn> }) =>
  createBackendPlugin({
    pluginId: 'ai-core',
    register(env) {
      env.registerExtensionPoint(
        toolExtensionPoint,
        tools as unknown as ToolExtensionPoint,
      );
      env.registerInit({ deps: {}, async init() {} });
    },
  });

const createMockDriverModule = (providerId: string) =>
  createBackendModule({
    pluginId: 'ai-core',
    moduleId: 'project-management-mock',
    register(env) {
      env.registerInit({
        deps: { registry: projectManagementDriversExtensionPoint },
        async init({ registry }) {
          registry.registerDriver({
            providerId,
            searchTickets: vi.fn(),
            getTicket: vi.fn(),
            createTicket: vi.fn(),
            commentTicket: vi.fn(),
          });
        },
      });
    },
  });

describe('aiCoreBackendModuleProjectManagement', () => {
  it('registers the ticket tools once a driver is registered', async () => {
    const tools = { addTool: vi.fn() };

    await startTestBackend({
      features: [
        createHostPlugin(tools),
        aiCoreBackendModuleProjectManagement,
        createMockDriverModule('jira'),
        mockServices.rootConfig.factory({ data: configData }),
        mockServices.logger.factory(),
      ],
    });

    expect(tools.addTool.mock.calls.map(([tool]) => tool.id)).toEqual([
      'project.ticket.search',
      'project.ticket.get',
      'project.ticket.create',
      'project.ticket.comment',
    ]);
  });

  it('fails when the configured driver was never registered', async () => {
    await expect(
      startTestBackend({
        features: [
          createHostPlugin({ addTool: vi.fn() }),
          aiCoreBackendModuleProjectManagement,
          createMockDriverModule('linear'),
          mockServices.rootConfig.factory({ data: configData }),
          mockServices.logger.factory(),
        ],
      }),
    ).rejects.toThrow(
      /No project management driver registered for identifier 'jira'/,
    );
  });
});
