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

/** Bounded configuration for catalog-backed code-reference impact assessment. */
export type SearchContextConfig = {
  modelRef: string;
  maxDepth: number;
  maxConsumers: number;
  maxToolInvocations: number;
  capableProviders: string[];
};

/** Reads configuration and rejects unsafe non-positive analysis limits. */
export const readSearchContextConfig = (
  config: Config,
): SearchContextConfig => {
  const section = config.getOptionalConfig('ai.agents.searchContext');

  if (!section) {
    throw new Error(
      'Search context requires ai.agents.searchContext configuration to be set',
    );
  }

  const maxDepth = section.getOptionalNumber('maxDepth') ?? 3;
  const maxConsumers = section.getOptionalNumber('maxConsumers') ?? 50;
  const maxToolInvocations = section.getOptionalNumber('maxToolInvocations') ?? 100;

  if (maxDepth < 1 || maxConsumers < 1 || maxToolInvocations < 1) {
    throw new Error('Search context limits must be positive');
  }

  return {
    modelRef: section.getString('model'),
    maxDepth,
    maxConsumers,
    maxToolInvocations,
    capableProviders: section.getOptionalStringArray('capableProviders') ?? [
      'github',
      'gitlab',
      'azuredevops',
    ],
  };
};
