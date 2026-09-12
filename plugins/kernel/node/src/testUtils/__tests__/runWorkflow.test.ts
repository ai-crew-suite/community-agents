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
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { END, WorkflowDefinition } from '../../types/workflow/definition';
import { runWorkflow } from '../runWorkflow';
import { createTestNodeContext } from '../nodeContext';

vi.mock('../workflow/validation/definition', () => ({
  validateWorkflowDefinition: () => []
}));

const createWorkflowFixture = (config: Partial<WorkflowDefinition<any, any>>): WorkflowDefinition<any, any> => ({
  id: 'test-wf',
  inputSchema: z.object({ query: z.string() }),
  state: {
    schema: z.object({
      value: z.number().default(0),
      log: z.array(z.string()).default([])
    }),
    stateVersion: 1
  },
  entryNode: 'start',
  nodes: {
    start: async () => ({ value: 10 }),
  },
  edges: [],
  artifactKinds: [],
  ...config
});

describe('runWorkflow Testing Framework Subsystem', () => {
  const dummyContext = createTestNodeContext({});

  describe('1. Execution Lifecycle & State Topologies', () => {
    it('runs a simple linear trajectory completely from entry to terminal END boundary code', async () => {
      const wf = createWorkflowFixture({
        edges: [{ from: 'start', to: END as any }]
      });

      const { events, finalState } = await runWorkflow(wf, { query: 'linear-test' }, dummyContext);

      expect(finalState.value).toBe(10);

      const eventTypes = events.map(e => e.type);
      expect(eventTypes).toEqual(['step', 'step', 'done']);

      // Fixed safe array extraction indexing to fix TS2532 errors
      const firstStepEvent = events.find(e => e.type === 'step');
      expect(firstStepEvent).toBeDefined();
      expect((firstStepEvent?.data as any)?.phase).toBe('enter');
    });

    it('evaluates dynamic route mapping functions correctly based on changing execution state criteria', async () => {
      const wf = createWorkflowFixture({
        nodes: {
          start: async () => ({ value: 5 }),
          branchLow: async () => ({ value: 1 }),
          branchHigh: async () => ({ value: 100 })
        },
        edges: [
          {
            from: 'start',
            route: (state: any) => state.value < 10 ? 'branchLow' : 'branchHigh' 
          },
          { from: 'branchLow', to: END as any },
          { from: 'branchHigh', to: END as any }
        ]
      });

      const { finalState } = await runWorkflow(
        wf,
        { query: 'conditional-test' },
        dummyContext,
        { skipValidation: true },
      );

      expect(finalState.value).toBe(1);
    });
  });

  describe('2. Human-in-the-Loop Intercepts', () => {
    it('fires and appends approval request indicators when encountering unvisited breakpoint gates', async () => {
      const wf = createWorkflowFixture({
        edges: [{ from: 'start', to: END as any }],
        interrupts: [{
          beforeNode: 'start',
          approvalRequest: () => ({ reason: 'MOCK_AUTH_REASON', effect: 'write' }),
          applyDecision: (s) => s
        }]
      });

      const { events } = await runWorkflow(wf, { query: 'interrupt-test' }, dummyContext);

      const approvalEvent = events.find(e => e.type === 'approval_request');
      expect(approvalEvent).toBeDefined();
      expect((approvalEvent?.data as any)?.reason).toBe('MOCK_AUTH_REASON');
      expect((approvalEvent?.data as any)?.approvalId).toBe('test-approval-start');
    });
  });

  describe('3. Sandbox Structural Invariants & Exception Testing', () => {
    it('prevents event loop freezing and raises a specific loop breaker error if an infinite cycle occurs', async () => {
      const wf = createWorkflowFixture({
        nodes: {
          start: async () => ({ value: 1 }),
          infiniteLoop: async () => ({ value: 2 })
        },
        edges: [
          { from: 'start', to: 'infiniteLoop' },
          { from: 'infiniteLoop', to: 'infiniteLoop' }
        ]
      });

      await expect(
        runWorkflow(wf, { query: 'trap-test' }, dummyContext, { maxIterations: 5, skipValidation: true })
      ).rejects.toThrowError(/iteration limit exceeded.*test-wf/);
    });

    it('rejects execution cleanly if a trajectory edge references a missing node function mapping', async () => {
      const wf = createWorkflowFixture({
        edges: [{ from: 'start', to: 'unregisteredGhostVertex' }]
      });

      await expect(
        runWorkflow(wf, { query: 'ghost-node-test' }, dummyContext, { skipValidation: true })
      ).rejects.toThrowError(/Node 'unregisteredGhostVertex' missing.*test-wf/);
    });
  });
});
