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
  incidentManagementDriversExtensionPoint,
  toolExtensionPoint,
} from '@ai-crew-suite/plugin-kernel-node';
import { describe, expect, it, vi } from 'vitest';
import { aiCoreBackendModuleIncidentManagement } from '../module';

const configData = {
  ai: { integrations: { incidentManagement: { provider: 'pagerduty' } } },
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
    moduleId: 'incident-management-mock',
    register(env) {
      env.registerInit({
        deps: { registry: incidentManagementDriversExtensionPoint },
        async init({ registry }) {
          registry.registerDriver({
            providerId,
            listIncidents: vi.fn(),
            getIncident: vi.fn(),
            getOnCallShifts: vi.fn(),
            getAlertHistory: vi.fn(),
            annotateIncident: vi.fn(),
          });
        },
      });
    },
  });

describe('aiCoreBackendModuleIncidentManagement', () => {
  it('registers the incident tools once a driver is registered', async () => {
    const tools = { addTool: vi.fn() };

    await startTestBackend({
      features: [
        createHostPlugin(tools),
        aiCoreBackendModuleIncidentManagement,
        createMockDriverModule('pagerduty'),
        mockServices.rootConfig.factory({ data: configData }),
        mockServices.logger.factory(),
      ],
    });

    expect(tools.addTool.mock.calls.map(([tool]) => tool.id)).toEqual([
      'incident.incident.list',
      'incident.incident.get',
      'incident.oncall.get',
      'incident.alert.history',
      'incident.incident.annotate',
    ]);
  });

  it('fails when the configured driver was never registered', async () => {
    await expect(
      startTestBackend({
        features: [
          createHostPlugin({ addTool: vi.fn() }),
          aiCoreBackendModuleIncidentManagement,
          createMockDriverModule('opsgenie'),
          mockServices.rootConfig.factory({ data: configData }),
          mockServices.logger.factory(),
        ],
      }),
    ).rejects.toThrow(
      /No incident management driver registered for identifier 'pagerduty'/,
    );
  });
});
