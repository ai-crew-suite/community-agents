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
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { HumanMessage } from '@langchain/core/messages';
import {
  defineDriverContractTests,
  FakeChatModel,
  createTestNodeContext,
  runWorkflow
} from '../index';
import { WorkflowDefinition, END } from '../../types/workflow/definition';
import { Tool, ToolRegistry } from '../../types/tools/core';

describe('Kernel Test Utilities Integration Suite', () => {
  class MockSearchTool implements Tool {
    public readonly id = 'spotify-catalog-service';
    public readonly providerId = 'spotify-catalog-service';

    async invoke(args: { query: string }) {
      if (!args?.query) return { status: 'limited', reason: 'empty_query' };
      return { matches: ['track_1', 'track_2'] };
    }
  }

  defineDriverContractTests({
    category: 'CatalogTool',
    makeDriver: () => new MockSearchTool(),
    exerciseOps: async (tool) => [
      await tool.invoke({ query: 'master of puppets' }),
      await tool.invoke({ query: '' })
    ]
  });

  const WorkflowInputSchema = z.object({
    initialPrompt: z.string(),
  });

  const StateInternalSchema = z.object({
    conversationHistory: z.array(z.any()).default([]),
    analysisResult: z.string().default(''),
    stepCount: z.number().default(0),
  });

  type TInput = z.infer<typeof WorkflowInputSchema>;
  type TState = z.infer<typeof StateInternalSchema>;

  const agenticWorkflowMock: WorkflowDefinition<TState, TInput> = {
    id: 'test-agentic-playlist-generator',
    inputSchema: WorkflowInputSchema,
    state: {
      schema: StateInternalSchema,
      stateVersion: 1
    },
    artifactKinds: ['tool_telemetry'] as const,
    entryNode: 'agent_decision_node',
    nodes: {
      agent_decision_node: async ({ state, input, ctx }) => {
        // Enforces your local parameter design shape object payload
        const llmResponse = await ctx.model.invoke({
          messages: [{
            role: 'user',
            content: input.initialPrompt
          } as any]
        });

        const nextResult = llmResponse.includes('SEARCH') ? 'needs_search' : 'complete';

        return {
          conversationHistory: [...state.conversationHistory, llmResponse],
          analysisResult: nextResult,
          stepCount: state.stepCount + 1,
        };
      },
      execute_tool_node: async ({ state, ctx }) => {
        const toolResult = await ctx.tools.invoke({
          toolId: 'spotify-catalog-service',
          args: { query: 'synthwave' }
        });

        await ctx.emitArtifact('tool_telemetry', { ref: 'success' });

        return {
          analysisResult: `found_tracks: ${JSON.stringify(toolResult.output)}`,
          stepCount: state.stepCount + 1,
        };
      }
    },
    edges: [
      {
        from: 'agent_decision_node',
        route: (state) => state.analysisResult === 'needs_search' ? 'execute_tool_node' : (END as any)
      },
      {
        from: 'execute_tool_node',
        to: END as any
      }
    ]
  };

  it('orchestrates deterministic LLM outputs, tool permissions, and workflow loops correctly', async () => {
    const fakeLLM = new FakeChatModel([
      { text: 'ACTION: SEARCH needed for synthwave parameters.', usage: { input: 12, output: 8, total: 20 } }
    ]);

    const mockTool = new MockSearchTool();
    const mockRegistry: ToolRegistry = new Map([['spotify-catalog-service', mockTool]]) as any;
    const frozenTime = new Date('2026-09-12T12:00:00.000Z');

    const testContext = createTestNodeContext({
      model: {
        invoke: async (input: { messages: Array<{ role: string; content: string }> }) => {
          const userMessageContent = input.messages[0]?.content ?? '';
          const response = await fakeLLM.invoke([new HumanMessage(userMessageContent)]);
          return response.content as string;
        },
        stream: async function* () {},
        forTier() { return this; }
      } as any,
      toolRegistry: mockRegistry,
      allowedToolIds: ['spotify-catalog-service'],
      now: frozenTime
    });

    const inputData: TInput = { initialPrompt: 'Find me some retro background tunes.' };

    const { events, finalState } = await runWorkflow(
      agenticWorkflowMock,
      inputData,
      testContext,
      { maxIterations: 10, skipValidation: true },
    );

    expect(fakeLLM.calls.length).toBe(1);
    expect(fakeLLM.calls[0]?.messages[0]?.content).toBe('Find me some retro background tunes.');

    expect(testContext.capturedArtifacts).toHaveLength(1);
    expect(testContext.capturedArtifacts[0]).toEqual({
      kind: 'tool_telemetry',
      payload: { ref: 'success' }
    });
    expect(testContext.now()).toEqual(frozenTime);

    expect(finalState.stepCount).toBe(2);
    expect(finalState.analysisResult).toContain('track_1');

    const stepPhases = events.filter(e => e.type === 'step').map(e => (e.data as any).node);
    expect(stepPhases).toEqual([
      'agent_decision_node',
      'agent_decision_node',
      'execute_tool_node',
      'execute_tool_node'
    ]);
    expect(events[events.length - 1]?.type).toBe('done');
  });
});
