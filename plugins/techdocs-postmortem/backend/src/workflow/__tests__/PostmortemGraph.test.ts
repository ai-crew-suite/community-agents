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
import { PostmortemGraph } from '../PostmortemGraph';

const input = {
  runId: 'run-1',
  agentId: 'techdocs-ai-postmortem',
  input: {
    query: JSON.stringify({ version: 1, incidentId: 'INC-1' }),
    source: 'catalog',
  },
} as AgentRunInput;

const collect = async (events: AsyncIterable<AgentEvent>) => {
  const result: AgentEvent[] = [];
  for await (const event of events) result.push(event);
  return result;
};

describe('PostmortemGraph', () => {
  it('produces a cited chronological timeline without publication tools', async () => {
    const invokeTool = vi.fn(async ({ toolId }: { toolId: string }) => ({
      toolId,
      summary: 'ok',
      output:
        toolId === 'incident.incident.get'
          ? {
              id: 'INC-1',
              title: 'Payments outage',
              state: 'resolved',
              service: 'payments',
              triggeredAt: '2026-01-01T00:00:00.000Z',
              resolvedAt: '2026-01-01T01:00:00.000Z',
              notes: [
                {
                  author: { id: 'dev' },
                  body: 'Investigating',
                  createdAt: '2026-01-01T00:30:00.000Z',
                },
              ],
            }
          : [
              {
                id: 'alert-1',
                title: 'Payments latency',
                triggeredAt: '2026-01-01T00:15:00.000Z',
              },
            ],
    }));

    const events = await collect(
      new PostmortemGraph({
        modelRef: 'postmortem',
        maxToolInvocations: 8,
        paddingMinutes: 15,
      }).run(input, { invokeTool } as unknown as WorkflowContext),
    );

    const artifact = events.find(event => event.type === 'artifact') as Extract<
      AgentEvent,
      { type: 'artifact' }
    >;

    const draft = JSON.parse(artifact.data.ref!);

    expect(draft.status).toBe('draft_only');

    expect(
      draft.timeline.map((event: { source: string }) => event.source),
    ).toEqual(['incident', 'alert', 'incident', 'incident']);

    expect(invokeTool.mock.calls.map(([call]) => call.toolId)).toEqual([
      'incident.incident.get',
      'incident.alert.history',
    ]);
  });
});
