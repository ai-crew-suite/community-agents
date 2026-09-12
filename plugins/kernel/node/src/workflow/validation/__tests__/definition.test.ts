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
import { validateWorkflowDefinition, CORE_VALIDATION_PIPELINE } from '../definition';
import type { ValidationRule } from '../../../types/workflow/validationRules';

const baseDef = (): WorkflowDefinition<{ ok: boolean }, { q: string }> & { customRules?: ValidationRule[] } => ({
  id: 'wf',
  inputSchema: z.object({ q: z.string() }),
  state: { schema: z.object({ ok: z.boolean() }), stateVersion: 1 },
  entryNode: 'a',
  nodes: {
    a: async () => ({ ok: true }),
  },
  edges: [{ from: 'a', route: () => END as any }],
  artifactKinds: [],
});

describe('Workflow Validation Engine - Pipeline Integration Subsystem', () => {

  describe('CORE_VALIDATION_PIPELINE Registry', () => {
    it('registers exactly five core structural code verification assertions', () => {
      expect(CORE_VALIDATION_PIPELINE.length).toBe(5);
    });
  });

  describe('validateWorkflowDefinition Master Pipeline', () => {
    it('passes a fully compliant, healthy workflow definition with zero errors', () => {
      expect(validateWorkflowDefinition(baseDef())).toEqual([]);
    });

    it('aggregates multiple distinct violations from separate rules simultaneously', () => {
      const def = baseDef();
      def.id = ' ';
      def.entryNode = 'missing';

      const violations = validateWorkflowDefinition(def);
      expect(violations.length).toBeGreaterThanOrEqual(2);
      expect(violations.some(v => v.message.includes('non-empty id'))).toBe(true);
      expect(violations.some(v => v.message.includes('not a declared node'))).toBe(true);
    });

    it('gracefully handles missing identifiers by falling back to unnamed-workflow criteria', () => {
      const def = baseDef();
      def.id = undefined as any;
      def.inputSchema = undefined as any; // Trigger an error to see the fallback name in action

      const violations = validateWorkflowDefinition(def);
      expect(violations.some(v => v.message.includes("'unnamed-workflow'"))).toBe(true);
    });

    it('appends and executes dynamic custom rules supplied on the definitions payload', () => {
      const def = baseDef();

      // Inject a custom plugin/rule matching the pipeline footprint definition
      const mockCustomRule: ValidationRule = (workflowDef, names, id) => {
        return [{ message: `Custom violation intercepted for ${id}` }];
      };

      def.customRules = [mockCustomRule];

      const violations = validateWorkflowDefinition(def);
      expect(violations).toContainEqual({
        message: 'Custom violation intercepted for wf'
      });
    });
  });
});
