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
import { 
  checkMetadata, 
  checkGraphNodes, 
  checkEdges, 
  checkInterrupts 
} from '../rules';

// Isolated mock baseline structure satisfying rules constraints
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

describe('Workflow Validation Engine - Rules Evaluation Subsystem', () => {
  const defaultNodeSet = new Set(['a']);
  const defaultWfId = 'wf';

  describe('1. checkMetadata', () => {
    it('returns an empty array when metadata satisfies entire configuration contract', () => {
      const def = baseDef();
      expect(checkMetadata(def, defaultNodeSet, defaultWfId)).toEqual([]);
    });

    it('flags broken or spaces-only workflow tracking identifiers', () => {
      const def = baseDef();
      def.id = '   ';
      expect(checkMetadata(def, defaultNodeSet, '   ')).toEqual([
        { message: 'Workflow definition must have a non-empty id' }
      ]);
    });

    it('flags absent inputSchema boundaries', () => {
      const def = baseDef();
      def.inputSchema = undefined as any;
      expect(checkMetadata(def, defaultNodeSet, defaultWfId)).toEqual([
        { message: "Workflow 'wf' has no inputSchema" }
      ]);
    });

    it('flags completely absent state configuration or schemas', () => {
      const def = baseDef();
      def.state = undefined as any;
      expect(checkMetadata(def, defaultNodeSet, defaultWfId)).toEqual([
        { message: "Workflow 'wf' has no state schema" }
      ]);
    });

    it('flags valid state blocks that omit a numeric version parameter', () => {
      const def = baseDef();
      // @ts-expect-error Intentionally setting invalid type for assertion matching rule
      def.state.stateVersion = 'v1';
      expect(checkMetadata(def, defaultNodeSet, defaultWfId)).toEqual([
        { message: "Workflow 'wf' is missing stateVersion" }
      ]);
    });
  });

  describe('2. checkGraphNodes', () => {
    it('returns an empty array when entryNode accurately anchors to an existing map element', () => {
      const def = baseDef();
      expect(checkGraphNodes(def, defaultNodeSet, defaultWfId)).toEqual([]);
    });

    it('instantly rejects configurations that map an empty node map', () => {
      const def = baseDef();
      def.nodes = {};
      expect(checkGraphNodes(def, new Set(), defaultWfId)).toEqual([
        { message: "Workflow 'wf' declares no nodes" }
      ]);
    });

    it('flags entryNode markers referencing unregistered node strings', () => {
      const def = baseDef();
      def.entryNode = 'ghost';
      expect(checkGraphNodes(def, defaultNodeSet, defaultWfId)).toEqual([
        { message: "Workflow 'wf' entryNode 'ghost' is not a declared node" }
      ]);
    });
  });

  describe('3. checkEdges', () => {
    it('passes clean static and predicate trajectories', () => {
      const def = baseDef();
      expect(checkEdges(def, defaultNodeSet, defaultWfId)).toEqual([]);
    });

    it('passes static transitions explicitly directed straight to the framework END sentinel symbol', () => {
      const def = baseDef();
      def.edges = [{ from: 'a', to: END as any }];
      expect(checkEdges(def, defaultNodeSet, defaultWfId)).toEqual([]);
    });

    it('flags routing origins starting out of an unmapped coordinate space', () => {
      const def = baseDef();
      def.edges = [{ from: 'phantom-origin', to: 'a' }];
      expect(checkEdges(def, defaultNodeSet, defaultWfId)).toEqual([
        { message: "Workflow 'wf' edge from unknown node 'phantom-origin'" }
      ]);
    });

    it('flags explicit destination keys pointing to unknown vertices', () => {
      const def = baseDef();
      def.edges = [{ from: 'a', to: 'unregistered-destination' }];
      expect(checkEdges(def, defaultNodeSet, defaultWfId)).toEqual([
        { message: "Workflow 'wf' edge to unknown node 'unregistered-destination'" }
      ]);
    });
  });

  describe('4. checkInterrupts', () => {
    it('passes when gates latch onto active structural elements', () => {
      const def = baseDef();
      def.interrupts = [{
        beforeNode: 'a',
        approvalRequest: () => ({ reason: 'auth', effect: 'write' as const }),
        applyDecision: (s) => s,
      }];
      expect(checkInterrupts(def, defaultNodeSet, defaultWfId)).toEqual([]);
    });

    it('flags parking triggers intercepting nonexistent graph nodes', () => {
      const def = baseDef();
      def.interrupts = [{
        beforeNode: 'missing-step',
        approvalRequest: () => ({ reason: 'auth', effect: 'write' as const }),
        applyDecision: (s) => s,
      }];
      expect(checkInterrupts(def, defaultNodeSet, defaultWfId)).toEqual([
        { message: "Workflow 'wf' interrupt targets missing node 'missing-step'" }
      ]);
    });
  });
});
