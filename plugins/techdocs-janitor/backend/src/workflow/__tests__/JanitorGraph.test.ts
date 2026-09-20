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
  WorkflowContext,
} from '@ai-crew-suite/plugin-kernel-node';
import { describe, expect, it, vi } from 'vitest';
import { JanitorGraph } from '../JanitorGraph';

const input = {
  runId: 'run-1',
  agentId: 'techdocs-ai-janitor',
  input: {
    query: JSON.stringify({
      version: 1,
      entityRef: 'component:default/payments',
      repoUrl: 'https://github.com/acme/payments',
      paths: ['docs/index.md'],
    }),
    source: 'catalog',
  },
} as AgentRunInput;

const collect = async (events: AsyncIterable<AgentEvent>) => {
  const result: AgentEvent[] = [];

  for await (const event of events) result.push(event);

  return result;
};

describe('JanitorGraph', () => {
  it('reports owner drift and read-only link findings without a write tool', async () => {
    const resolver = {
      getEntitySummary: vi.fn(async () => ({
        ref: 'component:default/payments',
        kind: 'Component',
        namespace: 'default',
        name: 'payments',
        owner: 'group:default/team-beta',
        annotations: {},
        tags: [],
      })),
    };

    const invokeTool = vi.fn(async () => ({
      toolId: 'vcs.repository.read_file',
      summary: 'doc',
      output: { content: 'owner: group:default/team-alpha\n[Old](../old.md)' },
    }));

    const events = await collect(
      new JanitorGraph(
        {
          modelRef: 'janitor',
          maxPaths: 10,
          maxFileBytes: 50000,
          maxToolInvocations: 20,
        },
        resolver as never,
      ).run(input, { invokeTool } as unknown as WorkflowContext),
    );

    const artifact = events.find(event => event.type === 'artifact') as Extract<
      AgentEvent,
      { type: 'artifact' }
    >;

    const report = JSON.parse(artifact.data.ref!);

    expect(
      report.discrepancies.map((item: { kind: string }) => item.kind),
    ).toEqual(['ownership_drift', 'dead_relative_link']);

    expect(invokeTool.mock.calls.map(([call]) => call.toolId)).toEqual([
      'vcs.repository.read_file',
    ]);
  });
});
