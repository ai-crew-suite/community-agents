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
import type { WorkflowDefinition } from '../../types/workflow/definition';

/**
 * Represents a validation error payload captured during static analysis.
 */
export type WorkflowValidationViolation = { message: string };

/**
 * A standard function signature for pluggable workflow validation rules.
 *
 * @param def - The full underlying workspace workflow definition object under evaluation.
 * @param nodeNames - A pre-calculated, optimization Set containing all declared node keys.
 * @param workflowId - The canonical tracking identifier or fallback name of the target workflow.
 * @returns An array containing discovered structural, type, or behavioral definition violations.
 */
export type ValidationRule = (
  def: WorkflowDefinition<any, any>,
  nodeNames: Set<string>,
  workflowId: string
) => WorkflowValidationViolation[];