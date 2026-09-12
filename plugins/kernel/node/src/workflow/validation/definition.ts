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
import { WorkflowDefinition } from '../../types/workflow/definition';
import type { ValidationRule, WorkflowValidationViolation } from '../../types/workflow/validationRules';
import { checkMetadata, checkGraphNodes, checkEdges, checkInterrupts } from './rules';
import { checkTopology } from './topology';

export const CORE_VALIDATION_PIPELINE: ValidationRule[] = [
  checkMetadata,
  checkGraphNodes,
  checkEdges,
  checkInterrupts,
  checkTopology,
];

export function validateWorkflowDefinition(
  def: WorkflowDefinition<any, any>
): WorkflowValidationViolation[] {
  const workflowId = def?.id?.trim() || 'unnamed-workflow';
  const nodeNames = new Set(Object.keys(def?.nodes || {}));

  // Combine fixed core code assertions with rules appended via extension points
  const dynamicPipeline = [
    ...CORE_VALIDATION_PIPELINE,
    ...(def.customRules ?? [])
  ];

  return dynamicPipeline.flatMap(rule => rule(def, nodeNames, workflowId));
}
