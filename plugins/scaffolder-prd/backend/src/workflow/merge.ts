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
import { createHash } from 'crypto';
import type {
  DeliveryBlueprint,
  DocumentationBlueprint,
  EpicBlueprint,
  StoryBlueprint,
  TemplateBlueprint,
} from './state';

/** Merges independent cited channel outputs into a stable blueprint-only artifact. */
export const mergeBlueprint = (input: {
  title: string;
  epic: EpicBlueprint;
  stories: StoryBlueprint[];
  template: TemplateBlueprint;
  documentation: DocumentationBlueprint;
}): DeliveryBlueprint => {
  const core = {
    title: input.title,
    readiness: 'complete' as const,
    epic: input.epic,
    stories: [...input.stories].sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
    template: input.template,
    documentation: input.documentation,
    openQuestions: [],
    limitations: [
      'Approval, ticket creation, Scaffolder task execution, catalog validation, and documentation publishing are not active in this blueprint-only milestone.',
    ],
    evidence: [
      ...input.epic.evidence,
      ...input.stories.flatMap(story => story.evidence),
      ...input.template.evidence,
      ...input.documentation.evidence,
    ].map(id => ({ id, source: 'prd' as const, summary: `PRD span ${id}` })),
  };

  return {
    ...core,
    blueprintHash: createHash('sha256')
      .update(JSON.stringify(core))
      .digest('hex'),
    status: 'blueprint_only',
  };
};
