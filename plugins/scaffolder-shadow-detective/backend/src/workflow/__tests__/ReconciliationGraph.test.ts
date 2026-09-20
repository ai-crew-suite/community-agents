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
import type { WorkflowContext } from '@ai-crew-suite/plugin-kernel-node';
import { describe, expect, it, vi } from 'vitest';
import { CatalogBindingIndex } from '../../services/CatalogBindingIndex';
import { ReconciliationGraph } from '../ReconciliationGraph';

describe('ReconciliationGraph', () => {
  it('filters registered resources and routes a tag-resolved orphan to its catalog group', async () => {
    const catalog = new CatalogBindingIndex(
      {
        getEntities: vi.fn().mockResolvedValue({
          items: [
            {
              kind: 'Resource',
              metadata: {
                annotations: { 'example.com/id': 'db-registered-01' },
              },
            },
            {
              kind: 'Group',
              metadata: { name: 'team-checkout', namespace: 'default' },
            },
          ],
        }),
      },
      'example.com/id',
    );

    const graph = new ReconciliationGraph(
      {
        modelRef: 'test',
        annotation: 'example.com/id',
        claimTemplateRef: 'template:default/register-existing-resource',
        claimBaseUrl: 'https://portal.example.test',
        maxResources: 50,
        ownerTagKeys: ['owner'],
        scanEnabled: false,
      },
      catalog,
    );

    const context = {
      invokeTool: vi.fn().mockResolvedValue({
        output: [
          { id: 'db-registered-01', type: 'rds', provider: 'aws' },
          {
            id: 'db-shadow-99',
            type: 'rds',
            provider: 'aws',
            tags: { owner: 'team-checkout' },
          },
        ],
      }),
    } as unknown as WorkflowContext;

    const events = [];

    for await (const event of graph.run(
      {
        runId: 'run-1',
        agentId: 'scaffolder-ai-shadow-detective',
        input: {
          query: JSON.stringify({ version: 1, source: 'manual' }),
          source: 'test',
        },
      },
      context,
    ))

    events.push(event);

    const artifact = events.find(event => event.type === 'artifact');
    const report = JSON.parse((artifact as { data: { ref: string } }).data.ref);

    expect(report).toMatchObject({
      scanned: 2,
      registered: 1,
      status: 'report_only',
    });

    expect(report.orphans).toHaveLength(1);

    expect(report.orphans[0]).toMatchObject({
      fingerprint: 'aws:rds:db-shadow-99',
      confidence: 'high',
      hypotheses: [
        expect.objectContaining({ groupRef: 'group:default/team-checkout' }),
      ],
    });
  });
});
