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
import type { TemplateParameterSchema } from '@backstage/plugin-scaffolder-common';
import type { IntentFacts, ParameterProposal, ValidationIssue } from './state';

type FieldSchema = { default?: unknown };

/** Flattens live multi-step schema fields and applies name/default values only to declared fields. */
export const coerceParameters = (
  facts: IntentFacts,
  schema: TemplateParameterSchema,
): { parameters: ParameterProposal[]; issues: ValidationIssue[] } => {
  const fields = schema.steps.flatMap(step =>
    Object.entries(
      (step.schema.properties ?? {}) as Record<string, FieldSchema>,
    ),
  );

  const required = new Set(
    schema.steps.flatMap(step => (step.schema.required ?? []) as string[]),
  );

  const parameters: ParameterProposal[] = [];
  const issues: ValidationIssue[] = [];

  fields.forEach(([field, definition], index) => {
    const value = field.toLowerCase().includes('name')
      ? facts.proposedName
      : definition.default;

    if (value !== undefined)
      parameters.push({
        field,
        value,
        origin:
          field.toLowerCase().includes('name') && facts.proposedName
            ? 'utterance'
            : 'default',
        evidence: [`tpl-${index + 1}`],
      });

    else if (required.has(field))
      issues.push({
        id: `iss-${issues.length + 1}`,
        field,
        kind: 'missing_field',
        message: `Required template field '${field}' has no value.`,
        blocking: true,
        question: `What value should be used for ${field}?`,
        evidence: [`tpl-${index + 1}`],
      });
  });

  return { parameters, issues };
};
