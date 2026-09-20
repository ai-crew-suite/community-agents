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
  CatalogEntityResolver,
  WorkflowContext,
} from '@ai-crew-suite/plugin-kernel-node';
import { describe, expect, it, vi } from 'vitest';
import { ImpactGraph } from '../ImpactGraph';

const root = {
  ref: 'component:default/api',
  kind: 'Component',
  namespace: 'default',
  name: 'api',
  annotations: {},
  tags: [],
};

const one = {
  ref: 'component:default/one',
  kind: 'Component',
  namespace: 'default',
  name: 'one',
  owner: 'group:default/payments',
  annotations: {},
  tags: [],
};

const two = {
  ref: 'component:default/two',
  kind: 'Component',
  namespace: 'default',
  name: 'two',
  owner: 'group:default/payments',
  annotations: {},
  tags: [],
};

describe('ImpactGraph', () => {
  it('separates an evidenced consumer from a capable zero-match consumer', async () => {
    const resolver: CatalogEntityResolver = {
      getEntitySummary: vi.fn().mockResolvedValue(root),
      getRelations: vi.fn().mockResolvedValue({
        rootRef: root.ref,
        entities: { [root.ref]: root, [one.ref]: one, [two.ref]: two },
        relations: [
          { type: 'dependencyOf', targetRef: one.ref },
          { type: 'dependencyOf', targetRef: two.ref },
        ],
        truncated: false,
      }),
      getIntegrationReferences: vi
        .fn()
        .mockImplementation(async ref => ({
          kubernetesIds: [],
          repositories: [
            ref === one.ref
              ? 'https://github.com/acme/one'
              : 'https://github.com/acme/two',
          ],
          oncall: [],
          monitoring: [],
        })),
      findByAnnotation: vi.fn(),
    };

    const context = {
      invokeTool: vi
        .fn()
        .mockImplementation(async ({ args }) => ({
          toolId: 'vcs.repository.search',
          summary: '',
          output: args.repoUrl.endsWith('/one')
            ? [{ path: 'client.ts', line: 4, snippet: '/v1/charge' }]
            : [],
        })),
    } as unknown as WorkflowContext;

    const graph = new ImpactGraph(
      {
        modelRef: 'test',
        maxDepth: 3,
        maxConsumers: 50,
        maxToolInvocations: 10,
        capableProviders: ['github'],
      },
      resolver,
    );

    const events = [];

    for await (const event of graph.run(
      {
        runId: 'run-1',
        agentId: 'search-ai-context',
        input: {
          query: JSON.stringify({
            version: 1,
            source: 'manual',
            entityRef: root.ref,
            change: { kind: 'endpoint_removed', symbol: '/v1/charge' },
          }),
          source: 'test',
        },
      },
      context,
    ))

    events.push(event);

    const artifact = events.find(event => event.type === 'artifact');

    const assessment = JSON.parse(
      (artifact as { data: { ref: string } }).data.ref,
    );

    expect(assessment.counts).toEqual({
      impacted: 1,
      unaffected: 1,
      unknown: 0,
    });

    expect(assessment.ownerRollups[0].owner).toBe('group:default/payments');
  });
});
