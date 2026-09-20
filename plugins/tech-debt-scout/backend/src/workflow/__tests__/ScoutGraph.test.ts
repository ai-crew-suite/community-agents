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
import { ScoutGraph } from '../ScoutGraph';

const config = {
  modelRef: 'tech-debt-scout',
  maxQuestionChars: 500,
  maxSignals: 100,
  maxToolInvocations: 12,
  escalationThreshold: 5,
};

const input = (repoUrl: string): AgentRunInput =>
  ({
    runId: 'run-1',
    agentId: 'tech-debt-ai-scout',
    input: {
      query: JSON.stringify({ version: 1, repoUrl }),
      source: 'catalog',
    },
  }) as AgentRunInput;

const collect = async (events: AsyncIterable<AgentEvent>) => {
  const output: AgentEvent[] = [];
  for await (const event of events) output.push(event);
  return output;
};

describe('ScoutGraph', () => {
  it('reports an unsupported provider as partial rather than clean', async () => {
    const invokeTool = vi.fn();

    const events = await collect(
      new ScoutGraph(config).run(input('https://bitbucket.org/acme/payments'), {
        logger: { warn: vi.fn() },
        invokeTool,
      } as unknown as WorkflowContext),
    );

    const artifact = events.find(event => event.type === 'artifact') as Extract<
      AgentEvent,
      { type: 'artifact' }
    >;

    const report = JSON.parse(artifact.data.ref!);

    expect(report).toMatchObject({
      status: 'partial',
      targets: [{ status: 'search_unsupported' }],
    });

    expect(invokeTool).not.toHaveBeenCalled();
  });

  it('emits suppressed and escalated findings without any write tool', async () => {
    // Explicitly define function argument type to force correct mock call signatures
    const invokeTool = vi.fn<(args: { toolId: string }) => Promise<any>>(async () => ({
      toolId: 'vcs.repository.search',
      summary: 'results',
      output: [
        { path: 'a.ts', line: 1, snippet: '// TODO: clean this up' },
        {
          path: 'b.ts',
          line: 2,
          snippet: '// FIXME(security): hardcoded salt',
        },
      ],
    }));

    const events = await collect(
      new ScoutGraph(config).run(input('https://github.com/acme/payments'), {
        logger: { warn: vi.fn() },
        invokeTool,
      } as unknown as WorkflowContext),
    );

    const artifact = events.find(event => event.type === 'artifact') as Extract<
      AgentEvent,
      { type: 'artifact' }
    >;

    const report = JSON.parse(artifact.data.ref!);

    expect(report.counts).toMatchObject({ escalate: 1, suppressed: 1 });

    // Safely reads call parameters out of the typed mock signature
    expect(
      invokeTool.mock.calls.map(([call]) => call.toolId)
    ).toEqual([
      'vcs.repository.search',
    ]);
  });
});
