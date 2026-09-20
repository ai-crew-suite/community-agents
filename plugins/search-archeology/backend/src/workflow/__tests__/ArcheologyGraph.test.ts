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
import { describe, expect, it, vi } from 'vitest';
import { ArcheologyGraph } from '../ArcheologyGraph';

const config = {
  modelRef: 'arch',
  maxQuestionChars: 500,
  maxLookbackYears: 5,
  maxTickets: 40,
  maxToolInvocations: 24,
  weightTriaged: 1,
  maxExperts: 10,
  treatUnresolvedAsOffboarded: true
};

const input: AgentRunInput = {
  runId: 'run-1',
  agentId: 'search-ai-archeology',
  input: {
    query: JSON.stringify({
      version: 1,
      question: 'Who knows payments?',
      repoUrl: 'https://github.com/acme/payments'
    }),
    source: 'catalog'
  }
} as AgentRunInput;

const collect = async (events: AsyncIterable<AgentEvent>) => {
  const output: AgentEvent[] = [];
  for await (const event of events) output.push(event);
  return output;
};

describe('ArcheologyGraph', () => {
  it('builds a cited ticket-triage-only partial matrix without VCS history calls', async () => {
    const invokeTool = vi.fn(async ({ toolId }: { toolId: string }) => ({
      toolId,
      summary: 'ok',
      output: toolId === 'project.ticket.search'
        ? [{ id: 'OPS-1', title: 'Payments outage', state: 'done' }]
        : {
            id: 'OPS-1',
            title: 'Payments outage',
            state: 'done',
            assigneeHistory: [{ changedAt: '2025-01-01T00:00:00.000Z', to: { id: 'retired-dev', displayName: 'Retired Dev' } }],
            comments: []
          }
    }));

    const events = await collect(
      new ArcheologyGraph(config).run(
        input,
        { logger: { warn: vi.fn() }, invokeTool } as unknown as WorkflowContext
      )
    );

    const artifact = events.find(event => event.type === 'artifact') as Extract<AgentEvent, { type: 'artifact' }>;
    const matrix = JSON.parse(artifact.data.ref!);

    expect(matrix).toMatchObject({
      status: 'partial',
      experts: [],
      offboardedContributors: [{ identity: { status: 'offboarded' } }]
    });
    expect(invokeTool.mock.calls.map(([call]) => call.toolId)).not.toContain('vcs.repository.list_commits');
  });
});
