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
import { NameAvailabilityChecker } from '../../services/NameAvailabilityChecker';
import { TemplateResolver } from '../../services/TemplateResolver';
import { IntentGraph } from '../IntentGraph';

describe('IntentGraph', () => {
  it('turns a catalog name collision into an awaiting-correction proposal without scaffolding', async () => {
    const service = {
      getTemplateParameterSchema: vi
        .fn()
        .mockResolvedValue({
          title: 'React service',
          steps: [
            {
              title: 'Details',
              schema: {
                properties: { name: { type: 'string' } },
                required: ['name'],
              },
            },
          ],
        }),
    };

    const templates = new TemplateResolver(service as never, {} as never, [
      'template:default/react-service-template',
    ]);

    const names = new NameAvailabilityChecker({
      getEntityByRef: vi.fn().mockResolvedValue({ kind: 'Component' }),
    });

    const graph = new IntentGraph(
      {
        modelRef: 'test',
        maxUtteranceChars: 1000,
        minSelectionScore: 0.35,
        allowedTemplates: ['template:default/react-service-template'],
        checkCatalogName: true,
        executeEnabled: false,
      },
      templates,
      names,
    );

    const events = [];

    for await (const event of graph.run(
      {
        runId: 'run-1',
        agentId: 'scaffolder-ai-intent',
        input: {
          query: JSON.stringify({
            version: 1,
            source: 'manual',
            utterance: 'Create a react app called payment-gateway',
          }),
          source: 'test',
        },
      },
      {} as WorkflowContext,
    ))

    events.push(event);

    const artifact = events.find(event => event.type === 'artifact');

    const proposal = JSON.parse(
      (artifact as { data: { ref: string } }).data.ref,
    );

    expect(proposal).toMatchObject({
      status: 'awaiting_correction',
      selectedTemplate: 'template:default/react-service-template',
    });

    expect(proposal.issues[0]).toMatchObject({
      kind: 'name_taken',
      field: 'name',
    });

    expect(service.getTemplateParameterSchema).toHaveBeenCalledOnce();
  });
});
