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
import { RadarGraph } from '../RadarGraph';

const config = {
  modelRef: 'tech-radar-manager',
  radarSourceUrl: 'https://example.test/radar.json',
  maxToolInvocations: 8,
  assessToTrialRatio: 0.3,
};

const input = {
  runId: 'run-1',
  agentId: 'tech-radar-ai-manager',
  input: {
    query: JSON.stringify({
      version: 1,
      repoUrl: 'https://github.com/acme/web',
    }),
    source: 'catalog',
  },
} as AgentRunInput;

const collect = async (events: AsyncIterable<AgentEvent>) => {
  const output: AgentEvent[] = [];
  for await (const event of events) output.push(event);
  return output;
};

describe('RadarGraph', () => {
  it('emits a cited analysis from radar and package manifest evidence', async () => {
    const reader = {
      readUrl: vi.fn(async () => ({
        toString: () =>
          JSON.stringify({
            entries: [
              { id: 'vite', title: 'Vite', ring: 'assess', quadrant: 'tools' },
            ],
          }),
      })),
    };

    const invokeTool = vi.fn(async () => ({
      toolId: 'vcs.repository.read_file',
      summary: 'manifest',
      output: { content: JSON.stringify({ dependencies: { vite: '^6.0.0' } }) },
    }));

    const events = await collect(
      new RadarGraph(config, reader as never).run(input, {
        invokeTool,
      } as unknown as WorkflowContext),
    );

    const artifact = events.find(event => event.type === 'artifact') as Extract<
      AgentEvent,
      { type: 'artifact' }
    >;

    const analysis = JSON.parse(artifact.data.ref!);
    expect(analysis).toMatchObject({
      status: 'analysis_only',
      proposals: [{ technology: 'vite', toRing: 'trial' }],
    });

    expect(invokeTool.mock.calls.map(([call]) => call.toolId)).toEqual([
      'vcs.repository.read_file',
    ]);
  });
});
