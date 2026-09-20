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
import { createBackendModule, createServiceFactory, coreServices } from '@backstage/backend-plugin-api';
import {
  toolExtensionPoint,
  qualityScorecardsExtensionPoint,
  QualityScorecardsDriver
} from '@ai-crew-suite/plugin-kernel-node';
import { aiCoreBackendModuleQualityScorecards } from '../module';

describe('aiCoreBackendModuleQualityScorecards Orchestration', () => {
  const configFactory = createServiceFactory({
    service: coreServices.rootConfig,
    deps: {},
    async factory() {
      return mockServices.rootConfig({
        data: {
          ai: {
            integrations: {
              qualityScorecards: {
                provider: 'mock-compliance-provider',
              },
            },
          },
        },
      });
    },
  });

  it('boots cleanly and registers tool boundaries when a matching sub-driver is supplied', async () => {
    const addedTools: any[] = [];
    const mockToolExtensionPoint = {
      addTool: (tool: any) => {
        addedTools.push(tool);
      },
    };

    const mockDriver: QualityScorecardsDriver = {
      providerId: 'mock-compliance-provider',
      getEntityScorecard: vi.fn(),
      submitRadarProposal: vi.fn(),
    };

    const driverInterceptor = createBackendModule({
      pluginId: 'ai-core',
      moduleId: 'test-driver-interceptor',
      register(env) {
        env.registerInit({
          deps: { registry: qualityScorecardsExtensionPoint },
          async init({ registry }) {
            registry.registerDriver(mockDriver);
          },
        });
      },
    });

    const toolInterceptor = createBackendModule({
      pluginId: 'ai-core',
      moduleId: 'test-tool-interceptor',
      register(env) {
        env.registerExtensionPoint(toolExtensionPoint, mockToolExtensionPoint);
        env.registerInit({ deps: {}, async init() {} });
      },
    });

    await startTestBackend({
      features: [
        aiCoreBackendModuleQualityScorecards, 
        driverInterceptor, 
        toolInterceptor,
        configFactory
      ],
    });

    expect(addedTools.some(t => t.id === 'quality.scorecard.get_entity_scorecard')).toBe(true);
    expect(addedTools.some(t => t.id === 'quality.scorecard.submit_radar_proposal')).toBe(true);
  });
});
