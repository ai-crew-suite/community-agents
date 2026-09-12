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
import { END } from '../../types/workflow/definition';
import type { WorkflowValidationViolation, ValidationRule } from '../../types/workflow/validationRules';

/**
 * Evaluates core root configuration metadata on the workflow specification.
 *
 * Verifies that the workflow provides a traceable tracking identity block, an asset
 * entry schema configuration, a state preservation contract, and valid versioning details.
 *
 * @param def - The workflow definition structure.
 * @param _ - Unused node set context parameter required to adhere to the `ValidationRule` contract.
 * @param workflowId - The validated name or fallback id of the targeted workflow block.
 * @returns Array of metadata formatting violations.
 */
export const checkMetadata: ValidationRule = (def, _, workflowId) => {
  const errors: WorkflowValidationViolation[] = [];
  if (!def.id?.trim()) errors.push({ message: 'Workflow definition must have a non-empty id' });
  if (!def.inputSchema) errors.push({ message: `Workflow '${workflowId}' has no inputSchema` });
  if (!def.state?.schema) errors.push({ message: `Workflow '${workflowId}' has no state schema` });
  if (def.state && typeof def.state.stateVersion !== 'number') {
    errors.push({ message: `Workflow '${workflowId}' is missing stateVersion` });
  }
  return errors;
};

/**
 * Evaluates node registry integrity by checking graph vertices.
 *
 * Ensures that the workflow defines at least one vertex and that the configured
 * engine entry node matches a valid name within the registered node collection.
 *
 * @param def - The workflow definition structure.
 * @param nodeNames - Pre-parsed set of all valid declared workflow node names.
 * @param workflowId - The verified tracking string of the workflow context.
 * @returns Array of node definition violations.
 */
export const checkGraphNodes: ValidationRule = (def, nodeNames, workflowId) => {
  const errors: WorkflowValidationViolation[] = [];
  if (nodeNames.size === 0) return [{ message: `Workflow '${workflowId}' declares no nodes` }];
  if (!nodeNames.has(def.entryNode)) {
    errors.push({ message: `Workflow '${workflowId}' entryNode '${def.entryNode}' is not a declared node` });
  }
  return errors;
};

/**
 * Evaluates structural mapping boundaries by verifying workflow edges.
 *
 * Audits every statically declared connection path to guarantee that all trajectories
 * stem from known coordinates and route exclusively toward valid target nodes or the
 * runtime engine's terminal symbol sentinel (`END`).
 *
 * @param def - The workflow definition structure.
 * @param nodeNames - Pre-parsed set of all valid declared workflow node names.
 * @param workflowId - The verified tracking string of the workflow context.
 * @returns Array of explicit transition mismatch errors.
 */
export const checkEdges: ValidationRule = (def, nodeNames, workflowId) => {
  const errors: WorkflowValidationViolation[] = [];
  for (const edge of def.edges || []) {
    if (!nodeNames.has(edge.from)) {
      errors.push({ message: `Workflow '${workflowId}' edge from unknown node '${edge.from}'` });
    }
    if ('to' in edge && !nodeNames.has(edge.to) && (edge.to as any) !== END) {
      errors.push({ message: `Workflow '${workflowId}' edge to unknown node '${edge.to}'` });
    }
  }
  return errors;
};

/**
 * Evaluates Human-in-the-Loop event hook bounds by verifying interrupt nodes.
 *
 * Scans human interception intercept gates to ensure they anchor onto registered graph 
 * vertices, avoiding dangling pauses before unmapped runtime actions.
 *
 * @param def - The workflow definition structure.
 * @param nodeNames - Pre-parsed set of all valid declared workflow node names.
 * @param workflowId - The verified tracking string of the workflow context.
 * @returns Array of orphaned lifecycle intercept targets.
 */
export const checkInterrupts: ValidationRule = (def, nodeNames, workflowId) => {
  return (def.interrupts || [])
    .filter(i => !nodeNames.has(i.beforeNode))
    .map(i => ({ message: `Workflow '${workflowId}' interrupt targets missing node '${i.beforeNode}'` }));
};
