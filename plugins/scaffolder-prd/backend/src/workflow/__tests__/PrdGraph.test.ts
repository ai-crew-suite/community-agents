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
import { describe, expect, it } from 'vitest';
import { PrdGraph } from '../PrdGraph';

describe('PrdGraph', () => {
  it('emits cited three-channel blueprint without external writes', async () => {
    const graph = new PrdGraph({
      modelRef: 'test',
      maxPrdChars: 1000,
      maxStories: 3,
      allowedTemplates: ['template:default/react-service-template'],
      executeEnabled: false,
    });

    const events = [];

    for await (const event of graph.run(
      {
        runId: 'run-1',
        agentId: 'scaffolder-ai-prd',
        input: {
          query: JSON.stringify({
            version: 1,
            source: 'manual',
            prdText:
              'Multi factor authentication\nUsers enroll an authenticator\nUsers recover access',
          }),
          source: 'test',
        },
      },
      {} as WorkflowContext,
    ))

    events.push(event);

    const artifact = events.find(event => event.type === 'artifact');

    const blueprint = JSON.parse(
      (artifact as { data: { ref: string } }).data.ref,
    );

    expect(blueprint).toMatchObject({
      readiness: 'complete',
      status: 'blueprint_only',
      template: { templateRef: 'template:default/react-service-template' },
    });

    expect(blueprint.stories).toHaveLength(2);
    expect(blueprint.documentation.files[0].evidence).toEqual(['prd-1']);
  });
});
