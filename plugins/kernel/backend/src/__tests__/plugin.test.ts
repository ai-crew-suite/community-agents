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
import { describe, expect, it } from 'vitest';
import { startTestBackend } from '@backstage/backend-test-utils';
import {
  agentExtensionPoint,
  AgentDefinition,
  RunStore,
  runtimeStoreExtensionPoint,
  sourceExtensionPoint,
  SourceDescriptor,
} from '@ai-crew-suite/plugin-kernel-node';
import { ragAiPlugin } from '../plugin';

const createAgent = (id: string): AgentDefinition => ({
  id,
  modelRef: 'model-a',
  workflowRef: 'workflow-a',
  systemPrompt: 'Use grounded context',
  toolIds: [],
});

interface RegistrationPayload {
  extensionPoints: Array<{ extensionPoint: unknown; factory(): unknown }>;
  init?: unknown;
}

const capturePluginRegistrations = (): {
  registration: RegistrationPayload;
  extensionPoints: Map<unknown, unknown>
} => {
  const registrations = (ragAiPlugin as unknown as {
    getRegistrations(): RegistrationPayload[];
  }).getRegistrations();

  const registration = registrations[0];
  if (!registration) {
    throw new Error('Plugin initialization failed: getRegistrations returned an empty structural set.');
  }

  const extensionPoints = new Map(
    registration.extensionPoints.map(({ extensionPoint, factory }) => [
      extensionPoint,
      factory(),
    ]),
  );

  return { registration, extensionPoints };
};

describe('ragAiPlugin boot registration', () => {
  it('proves the framework plugin can boot successfully via test backends', async () => {
    // Backstage standard verification checking that the module wires up and satisfies system dependencies
    const backend = await startTestBackend({
      features: [ragAiPlugin],
    });
    expect(backend).toBeDefined();
  });

  it('fails safely when two sub-plugins register conflicting vector sources', () => {
    const { registration, extensionPoints } = capturePluginRegistrations();
    const sources = extensionPoints.get(sourceExtensionPoint) as {
      addSource(source: SourceDescriptor): void;
    } | undefined;

    expect(sources).toBeDefined();
    if (sources) {
      sources.addSource({ id: 'catalog', description: 'Primary catalog vector source' });

      expect(() =>
        sources.addSource({ id: 'catalog', description: 'Conflicting catalog vector source' }),
      ).toThrow("Source 'catalog' may only be registered once");
    }
    expect(registration.init).toBeDefined();
  });

  it('fails safely when two sub-plugins register duplicate agent profiles', () => {
    const { registration, extensionPoints } = capturePluginRegistrations();
    const agents = extensionPoints.get(agentExtensionPoint) as {
      addAgent(agent: AgentDefinition): void;
    } | undefined;

    expect(agents).toBeDefined();
    if (agents) {
      agents.addAgent(createAgent('service-contextualizer'));

      expect(() => agents.addAgent(createAgent('service-contextualizer'))).toThrow(
        "Agent 'service-contextualizer' may only be registered once",
      );
    }
    expect(registration.init).toBeDefined();
  });

  it('fails safely when two modules register conflicting runtime stores', () => {
    const { registration, extensionPoints } = capturePluginRegistrations();
    const runtimeStores = extensionPoints.get(runtimeStoreExtensionPoint) as {
      setRunStore(store: RunStore): void;
    } | undefined;
    const runStore = {} as unknown as RunStore;

    expect(runtimeStores).toBeDefined();
    if (runtimeStores) {
      runtimeStores.setRunStore(runStore);

      expect(() => runtimeStores.setRunStore(runStore)).toThrow(
        'RunStore may only be registered once',
      );
    }
    expect(registration.init).toBeDefined();
  });
});
