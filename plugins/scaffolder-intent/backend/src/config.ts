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

/** Bounded allow-list configuration for schema-backed template proposals. */
export type ScaffolderIntentConfig = {
  modelRef: string;
  maxUtteranceChars: number;
  minSelectionScore: number;
  allowedTemplates: string[];
  checkCatalogName: boolean;
  executeEnabled: boolean;
};

/** Reads intent configuration and rejects missing or malformed template allow-lists. */
export const readScaffolderIntentConfig = (config: Config): ScaffolderIntentConfig => {
  const section = config.getOptionalConfig('ai.agents.scaffolderIntent');

  if (!section)
    throw new Error(
      'Scaffolder intent requires ai.agents.scaffolderIntent configuration',
    );

  const allowedTemplates = section
    .getConfig('templates')
    .getStringArray('allowed');

  if (
    !allowedTemplates.length ||
    allowedTemplates.some(ref => !/^template:[^/]+\/.+/.test(ref))
  )
    throw new Error(
      'Scaffolder intent requires valid non-empty templates.allowed',
    );

  return {
    modelRef: section.getString('model'),
    maxUtteranceChars: section.getOptionalNumber('maxUtteranceChars') ?? 1000,
    minSelectionScore: section.getOptionalNumber('minSelectionScore') ?? 0.35,
    allowedTemplates,
    checkCatalogName:
      section
        .getOptionalConfig('validation')
        ?.getOptionalBoolean('checkCatalogName') ?? true,
    executeEnabled:
      section.getOptionalConfig('execute')?.getOptionalBoolean('enabled') ??
      false,
  };
};
