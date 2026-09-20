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
import { Config } from '@backstage/config';

/** Bounded configuration for deterministic, cited blueprint-only PRD translation. */
export type ScaffolderPrdConfig = {
  modelRef: string;
  maxPrdChars: number;
  maxStories: number;
  allowedTemplates: string[];
  executeEnabled: boolean;
};

/** Reads required model and allow-listed template configuration. */
export const readScaffolderPrdConfig = (config: Config): ScaffolderPrdConfig => {
  const section = config.getOptionalConfig('ai.agents.scaffolderPrd');

  if (!section)
    throw new Error(
      'Scaffolder PRD requires ai.agents.scaffolderPrd configuration',
    );

  const allowedTemplates = section
    .getConfig('templates')
    .getStringArray('allowed');

  if (
    !allowedTemplates.length ||
    allowedTemplates.some(template => !template.startsWith('template:'))
  )
    throw new Error(
      'Scaffolder PRD requires valid non-empty templates.allowed',
    );

  return {
    modelRef: section.getString('model'),
    maxPrdChars: section.getOptionalNumber('maxPrdChars') ?? 20_000,
    maxStories: section.getOptionalNumber('maxStories') ?? 8,
    allowedTemplates,
    executeEnabled:
      section.getOptionalConfig('execute')?.getOptionalBoolean('enabled') ??
      false,
  };
};
