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
import type {
  AgentEvent,
  AgentRunInput,
  WorkflowContext
} from '@ai-crew-suite/plugin-kernel-node';
import { describe, expect, it, vi } from 'vitest';
import { DriftGraph } from '../DriftGraph';

const config = {
  modelRef: 'drift',
  maxInfraFiles: 8,
  maxDriftItems: 40,
  maxToolInvocations: 18,
  infraPaths: ['main.tf'],
  sweep: { enabled: false, cron: '0 */24 * * *', maxSweepComponents: 50, entityRefs: [] },
  remediate: { enabled: false }
};

const input = (query: unknown) => ({
  runId: 'run-1',
  agentId: 'scaffolder-ai-drift-detector',
  input: { query: JSON.stringify(query), source: 'catalog' }
} as AgentRunInput);

const collect = async (events: AsyncIterable<AgentEvent>) => {
  const result: AgentEvent[] = [];
  for await (const event of events) result.push(event);
  return result;
};

const report = (events: AgentEvent[]) =>
  JSON.parse(
    (events.find(event => event.type === 'artifact') as Extract<AgentEvent, { type: 'artifact' }>)
      .data.ref!
  );

describe('DriftGraph', () => {
  it('reports deterministic replica drift without mutating live infrastructure', async () => {
    const invokeTool = vi.fn(async ({ toolId }: { toolId: string }) => ({
      toolId,
      summary: 'ok',
      output: toolId === 'kubernetes.workload.resolve'
        ? [{ cluster: 'c', namespace: 'n', name: 'app', kind: 'Deployment' }]
        : {
            cluster: 'c',
            namespace: 'n',
            name: 'app',
            kind: 'Deployment',
            replicas: { desired: 6, ready: 6 },
            conditions: [],
            pods: []
          }
    }));

    const context = { logger: { warn: vi.fn() }, invokeTool } as unknown as WorkflowContext;

    const events = await collect(
      new DriftGraph(config).run(
        input({
          version: 1,
          source: 'manual',
          entityRef: 'component:default/app',
          blueprint: { replicas: 2 }
        }),
        context
      )
    );

    const result = report(events);

    expect(result).toMatchObject({
      status: 'drifted',
      items: [{ field: 'spec.replicas', expected: { value: 2 }, actual: { value: 6 } }]
    });

    expect(invokeTool.mock.calls.map(([call]) => call.toolId)).not.toContain(
      'vcs.pull_request.create'
    );
  });

  it('returns insufficient evidence when shared blueprint provenance is unavailable', async () => {
    const context = { logger: { warn: vi.fn() }, invokeTool: vi.fn() } as unknown as WorkflowContext;

    const events = await collect(
      new DriftGraph(config).run(
        input({ version: 1, source: 'manual', entityRef: 'component:default/app' }),
        context
      )
    );

    expect(report(events)).toMatchObject({
      status: 'insufficient_evidence',
      items: []
    });
  });
});
