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
  observabilityDriversExtensionPoint,
  toolExtensionPoint,
} from '@ai-crew-suite/plugin-kernel-node';
import { describe, expect, it, vi } from 'vitest';
import { aiCoreBackendModuleObservability } from '../module';

const configData = {
  ai: { integrations: { observability: { provider: 'datadog' } } },
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
    moduleId: 'observability-mock',
    register(env) {
      env.registerInit({
        deps: { registry: observabilityDriversExtensionPoint },
        async init({ registry }) {
          registry.registerDriver({
            providerId,
            queryMetrics: vi.fn(),
            searchLogs: vi.fn(),
            searchTraces: vi.fn(),
            listDashboards: vi.fn(),
          });
        },
      });
    },
  });

describe('aiCoreBackendModuleObservability', () => {
  it('registers the telemetry tools once a driver is registered', async () => {
    const tools = { addTool: vi.fn() };

    await startTestBackend({
      features: [
        createHostPlugin(tools),
        aiCoreBackendModuleObservability,
        createMockDriverModule('datadog'),
        mockServices.rootConfig.factory({ data: configData }),
        mockServices.logger.factory(),
      ],
    });

    expect(tools.addTool.mock.calls.map(([tool]) => tool.id)).toEqual([
      'observability.metrics.query',
      'observability.logs.search',
      'observability.traces.search',
      'observability.dashboard.list',
    ]);
  });

  it('fails when the configured driver was never registered', async () => {
    await expect(
      startTestBackend({
        features: [
          createHostPlugin({ addTool: vi.fn() }),
          aiCoreBackendModuleObservability,
          createMockDriverModule('newrelic'),
          mockServices.rootConfig.factory({ data: configData }),
          mockServices.logger.factory(),
        ],
      }),
    ).rejects.toThrow(
      /No observability driver registered for identifier 'datadog'/,
    );
  });
});
