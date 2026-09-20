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
import { startTestBackend, mockServices } from '@backstage/backend-test-utils';
import { createBackendPlugin, createBackendModule } from '@backstage/backend-plugin-api';
import { toolExtensionPoint } from '@ai-crew-suite/plugin-kernel-node';
import { vcsDriversExtensionPoint } from '@ai-crew-suite/plugin-kernel-node';
import { describe, expect, it, vi } from 'vitest';
import { aiCoreBackendModuleVcs } from '../module';

describe('aiCoreBackendModuleVcs', () => {
  it('should initialize successfully with a valid provider configuration', async () => {
    const configData = {
      ai: {
        integrations: {
          vcs: {
            provider: 'github',
          },
        },
      },
      integrations: {
        github: [
          {
            host: 'github.com',
            token: 'mock-token',
          },
        ],
      },
    };

    const mockToolExtensionPoint = {
      addTool: vi.fn(),
    };

    // 1. Core parent plugin host container
    const mockAiCorePlugin = createBackendPlugin({
      pluginId: 'ai-core',
      register(env) {
        env.registerExtensionPoint(toolExtensionPoint, mockToolExtensionPoint);
        env.registerInit({
          deps: {},
          async init() {
            // Keep this block execution footprint empty as it is just a host stub
          },
        });
      },
    });

    // 2. Construct a valid inline test backend module
    const inlineMockDriverModule = createBackendModule({
      pluginId: 'ai-core',
      moduleId: 'vcs-github-mock',
      register(env) {
        env.registerInit({
          deps: {
            vcsRegistry: vcsDriversExtensionPoint,
          },
          async init({ vcsRegistry }) {
            // Populate the registry to satisfy the core plugin's startup query
            vcsRegistry.registerDriver({
              providerId: 'github',
              getRepositoryMetadata: vi.fn(),
              readFile: vi.fn(),
              searchRepository: vi.fn(),
              listPullRequests: vi.fn(),
            });
          },
        });
      },
    });

    // 3. Spin up the isolated test backend with 100% compliant framework components
    await expect(
      startTestBackend({
        features: [
          mockAiCorePlugin, 
          aiCoreBackendModuleVcs, 
          inlineMockDriverModule,
          mockServices.rootConfig.factory({ data: configData }),
          mockServices.logger.factory(),
          mockServices.urlReader.factory(),
        ],
      }),
    ).resolves.toBeDefined();
  });
});
