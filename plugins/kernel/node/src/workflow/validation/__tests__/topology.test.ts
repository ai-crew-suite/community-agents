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
import { END, WorkflowDefinition } from '../../../types/workflow/definition';
import { checkTopology, buildAdjacencyMap, TopologyTraversal } from '../topology';

const baseDef = (): WorkflowDefinition<{ ok: boolean }, { q: string }> => ({
  id: 'wf',
  inputSchema: z.object({ q: z.string() }),
  state: { schema: z.object({ ok: z.boolean() }), stateVersion: 1 },
  entryNode: 'a',
  nodes: {
    a: async () => ({ ok: true }),
  },
  edges: [{ from: 'a', route: () => END }],
  artifactKinds: [],
});

describe('Workflow Validation Engine - Topological Evaluation Subsystem', () => {
  const defaultWfId = 'wf';

  describe('1. checkTopology Integration Rule', () => {
    it('passes complex multi-node connected cyclic or acyclic loops with valid terminal boundaries', () => {
      const def = baseDef();
      def.nodes = { a: async () => ({}), b: async () => ({}), c: async () => ({}) };
      def.edges = [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c' },
        { from: 'c', to: END as any },
      ];
      expect(checkTopology(def, new Set(['a', 'b', 'c']), defaultWfId)).toEqual([]);
    });

    it('flags dead-ends where vertices have zero operational exits to advance tracking', () => {
      const def = baseDef();
      def.nodes = { a: async () => ({}), b: async () => ({}) }; 
      def.edges = [{ from: 'a', to: 'b' }]; 

      expect(checkTopology(def, new Set(['a', 'b']), defaultWfId)).toEqual([
        { message: "Workflow 'wf' contains a dead-end at node 'b'" }
      ]);
    });

    it('flags unreachable structural orphan sub-graphs detached from the entryNode tree path', () => {
      const def = baseDef();
      def.nodes = { a: async () => ({}), b: async () => ({}), c: async () => ({}) };
      def.edges = [
        { from: 'a', route: () => END },
        { from: 'b', to: 'c' },
        { from: 'c', to: END as any },
      ];

      expect(checkTopology(def, new Set(['a', 'b', 'c']), defaultWfId)).toEqual([
        { message: "Workflow 'wf' contains an unreachable orphan node 'b'" },
        { message: "Workflow 'wf' contains an unreachable orphan node 'c'" }
      ]);
    });

    it('flags an infinite cyclic graph trap that has no path to the END sentinel', () => {
      const def = baseDef();
      def.nodes = { a: async () => ({}), b: async () => ({}) };
      def.edges = [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'a' }
      ];

      expect(checkTopology(def, new Set(['a', 'b']), defaultWfId)).toEqual([
        { message: "Workflow 'wf' is an infinite cyclic trap; no trajectory reaches 'END'" }
      ]);
    });

    it('flags single-node self-looping dead ends that disguise themselves as active trajectories', () => {
      const def = baseDef();
      def.nodes = { a: async () => ({}) };
      def.edges = [{ from: 'a', to: 'a' }];

      expect(checkTopology(def, new Set(['a']), defaultWfId)).toContainEqual({
        message: "Workflow 'wf' contains a self-looping dead-end at node 'a'"
      });
    });

    it('flags downstream multi-node infinite trap loops that stem cleanly from the entry point', () => {
      const def = baseDef();
      def.nodes = { a: async () => ({}), b: async () => ({}), c: async () => ({}) };
      def.edges = [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c' },
        { from: 'c', to: 'b' }
      ];

      expect(checkTopology(def, new Set(['a', 'b', 'c']), defaultWfId)).toContainEqual({
        message: "Workflow 'wf' is an infinite cyclic trap; no trajectory reaches 'END'"
      });
    });

    it('handles large multi-node linear topologies with high performance without causing event loop lags', () => {
      const def = baseDef();
      const largeNodeSet = new Set<string>();

      def.nodes = {};
      def.edges = [];

      for (let i = 0; i < 100; i++) {
        const currentName = `node_${i}`;
        largeNodeSet.add(currentName);
        def.nodes[currentName] = async () => ({});

        if (i < 99) {
          def.edges.push({ from: currentName, to: `node_${i + 1}` });
        } else {
          def.edges.push({ from: currentName, to: END as any });
        }
      }

      def.entryNode = 'node_0';

      const startTime = performance.now();
      const violations = checkTopology(def, largeNodeSet, defaultWfId);
      const duration = performance.now() - startTime;

      expect(violations).toEqual([]);
      expect(duration).toBeLessThan(10);
    });
  });

  describe('2. buildAdjacencyMap Engine Utility', () => {
    it('classifies unmapped dynamic code routes under the __DYNAMIC__ string token', () => {
      const nodeNames = new Set(['start']);
      const edges = [{ from: 'start', route: () => END as any }];
      const adjacencyMap = buildAdjacencyMap(edges, nodeNames);

      expect(adjacencyMap.get('start')?.has('__DYNAMIC__')).toBe(true);
    });
  });

  describe('3. TopologyTraversal Unit Context', () => {
    it('accurately identifies terminal exit loops matching __DYNAMIC__ trajectory anchors', () => {
      const outgoing = new Map<string, Set<string | symbol>>([
        ['start', new Set(['__DYNAMIC__'])]
      ]);
      const nodeNames = new Set(['start']);
      const traversal = new TopologyTraversal(outgoing, nodeNames);
      traversal.traverse('start');

      expect(traversal.hasTerminalPath).toBe(true);
      expect(traversal.getUnreachableNodes()).toEqual([]);
    });
  });
});
