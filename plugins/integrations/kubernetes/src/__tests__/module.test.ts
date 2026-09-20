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
  kubernetesDiagnosticsDriversExtensionPoint,
  toolExtensionPoint,
} from '@ai-crew-suite/plugin-kernel-node';
import { describe, expect, it, vi } from 'vitest';
import { aiCoreBackendModuleKubernetes } from '../module';

const configData = {
  ai: { integrations: { kubernetes: { provider: 'backstage' } } },
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
    moduleId: 'kubernetes-diagnostics-mock',
    register(env) {
      env.registerInit({
        deps: { registry: kubernetesDiagnosticsDriversExtensionPoint },
        async init({ registry }) {
          registry.registerDriver({
            providerId,
            resolveWorkloads: vi.fn(),
            getWorkloadSnapshot: vi.fn(),
            getPodSnapshot: vi.fn(),
            getPodLogs: vi.fn(),
            listWorkloadEvents: vi.fn(),
            getWorkloadTimeline: vi.fn(),
          });
        },
      });
    },
  });

describe('aiCoreBackendModuleKubernetes', () => {
  it('registers diagnostics tools once a driver is registered', async () => {
    const tools = { addTool: vi.fn() };

    await startTestBackend({
      features: [
        createHostPlugin(tools),
        aiCoreBackendModuleKubernetes,
        createMockDriverModule('backstage'),
        mockServices.rootConfig.factory({ data: configData }),
        mockServices.logger.factory(),
      ],
    });

    expect(tools.addTool.mock.calls.map(([tool]) => tool.id)).toEqual([
      'kubernetes.workload.resolve',
      'kubernetes.workload.get_snapshot',
      'kubernetes.pod.get_snapshot',
      'kubernetes.pod.get_logs',
      'kubernetes.workload.list_events',
      'kubernetes.workload.get_timeline',
    ]);
  });

  it('fails when the configured driver was never registered', async () => {
    await expect(
      startTestBackend({
        features: [
          createHostPlugin({ addTool: vi.fn() }),
          aiCoreBackendModuleKubernetes,
          createMockDriverModule('other'),
          mockServices.rootConfig.factory({ data: configData }),
          mockServices.logger.factory(),
        ],
      }),
    ).rejects.toThrow(
      /No Kubernetes diagnostics driver registered for identifier 'backstage'/,
    );
  });
});
