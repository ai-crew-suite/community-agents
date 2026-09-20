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
import { describe, it, expect, vi } from 'vitest';
import { startTestBackend } from '@backstage/backend-test-utils';
import { mockServices } from '@backstage/backend-test-utils';
import { createBackendModule } from '@backstage/backend-plugin-api';
import {
  toolExtensionPoint,
  cloudDriversExtensionPoint,
  CloudProviderDriver,
} from '../../../../../kernel/node/src';
import { aiCoreBackendModuleCloudProviders } from '../module';

describe('aiCoreBackendModuleCloudProviders', () => {
  const configData = {
    ai: {
      integrations: {
        cloudProviders: {
          defaultProvider: 'mock-cloud',
          providers: {
            'mock-cloud': { region: 'us-east-1' },
          },
        },
      },
    },
  };

  it('should boot cleanly and register tools when a matching extension driver is supplied', async () => {
    const addedTools: any[] = [];

    const mockToolExtensionPoint = {
      addTool: (tool: any) => {
        addedTools.push(tool);
      },
    };

    const mockDriver: CloudProviderDriver = {
      providerId: 'mock-cloud',
      lookupAccount: vi.fn(),
      lookupResource: vi.fn(),
      resourceDependencies: vi.fn(),
    };

    // Compile the driver hook via createBackendModule macro
    const driverInterceptorModule = createBackendModule({
      pluginId: 'ai-core',
      moduleId: 'test-driver-registration-interceptor',
      register(env) {
        env.registerInit({
          deps: {
            cloudRegistry: cloudDriversExtensionPoint,
          },
          async init({ cloudRegistry }) {
            cloudRegistry.registerDriver(mockDriver);
          },
        });
      },
    });

    // Compile the tool target hook via createBackendModule macro
    const toolInterceptorModule = createBackendModule({
      pluginId: 'ai-core',
      moduleId: 'test-tool-capture-interceptor',
      register(env) {
        env.registerExtensionPoint(toolExtensionPoint, mockToolExtensionPoint);
        env.registerInit({ deps: {}, async init() {} });
      },
    });

    await startTestBackend({
      features: [
        aiCoreBackendModuleCloudProviders,
        driverInterceptorModule,
        toolInterceptorModule,
        mockServices.rootConfig.factory({ data: configData }),
      ],
    });

    expect(addedTools.some(tool => tool.id === 'cloud.account.lookup')).toBe(
      true,
    );
  });

  it('should throw an informative boot-time error when the required driver has not registered', async () => {
    // Provide the tool extension point so the module can reach driver lookup,
    // but intentionally omit any driver registration.
    const toolExtensionPointOnlyModule = createBackendModule({
      pluginId: 'ai-core',
      moduleId: 'test-tool-extension-point-only',
      register(env) {
        env.registerExtensionPoint(toolExtensionPoint, {
          addTool: () => {},
        });
        env.registerInit({ deps: {}, async init() {} });
      },
    });

    const testExecution = startTestBackend({
      features: [
        aiCoreBackendModuleCloudProviders,
        toolExtensionPointOnlyModule,
        // No companion driver injected here
        mockServices.rootConfig.factory({ data: configData }),
      ],
    });

    await expect(testExecution).rejects.toThrow(
      /No cloud driver registered for identifier 'mock-cloud'/,
    );
  });
});
