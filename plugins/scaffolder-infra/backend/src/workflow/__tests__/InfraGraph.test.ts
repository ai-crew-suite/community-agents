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
import type { AgentEvent, AgentRunInput, WorkflowContext } from '@ai-crew-suite/plugin-kernel-node';
import { describe, expect, it } from 'vitest';
import { InfraGraph } from '../InfraGraph';
import type { ScaffolderInfraConfig } from '../../config';
import type { BlueprintResolver } from '../../services/BlueprintResolver';

const config: ScaffolderInfraConfig = {
  modelRef: 'infra',
  maxBlueprintBytes: 65536,
  maxGeneratedBytes: 131072,
  maxFiles: 8,
  maxToolInvocations: 10,
  maxCorrectionRounds: 2,
  allowOverwrite: false,
  sources: [{ id: 'approved', provider: 'terraform', url: 'https://example.test/main.tf' }],
  maxCpu: 8,
  maxMemoryMb: 16384,
  maxStorageGb: 512,
  allowedRegions: ['us-east-1']
};

const input = (request: unknown): AgentRunInput => ({
  runId: 'run-1',
  agentId: 'scaffolder-ai-infra',
  input: { query: JSON.stringify(request), source: 'catalog' }
} as AgentRunInput);

const collect = async (events: AsyncIterable<AgentEvent>) => {
  const output: AgentEvent[] = [];
  for await (const event of events) output.push(event);
  return output;
};

describe('InfraGraph', () => {
  it('emits a non-writing generated preview artifact from an approved blueprint', async () => {
    const resolver = {
      resolve: async () => ({ source: config.sources[0], content: 'name = "{{serviceName}}"' })
    } as unknown as BlueprintResolver;

    const events = await collect(
      new InfraGraph(config, resolver).run(
        input({
          version: 1,
          source: 'manual',
          provider: 'terraform',
          serviceName: 'orders',
          region: 'us-east-1'
        }),
        { logger: {} } as WorkflowContext
      )
    );

    const artifact = events.find(event => event.type === 'artifact') as Extract<AgentEvent, { type: 'artifact' }>;
    expect(JSON.parse(artifact.data.ref!)).toMatchObject({
      status: 'generated',
      files: [{ path: 'main.tf' }]
    });
  });

  it('reports blueprint_unavailable as an explained terminal outcome', async () => {
    const resolver = { resolve: async () => undefined } as unknown as BlueprintResolver;

    const events = await collect(
      new InfraGraph(config, resolver).run(
        input({ version: 1, source: 'manual', provider: 'terraform', serviceName: 'orders' }),
        { logger: {} } as WorkflowContext
      )
    );

    const artifact = events.find(event => event.type === 'artifact') as Extract<AgentEvent, { type: 'artifact' }>;
    expect(JSON.parse(artifact.data.ref!).status).toBe('blueprint_unavailable');
  });
});
