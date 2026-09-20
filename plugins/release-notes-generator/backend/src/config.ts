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

/** Deterministic category keyword taxonomy for customer-facing changes. */
export type CategoryTaxonomy = Record<
  'feature' | 'fix' | 'improvement' | 'breaking' | 'internal',
  string[]
>;

/** Resolved operational configuration for the release-notes workflow. */
export type ReleaseNotesConfig = {
  /** Installation-registered model identifier used only to rewrite draft copy. */
  modelRef: string;
  /** Hard cap on pull requests retained in a generated draft. */
  maxPullRequests: number;
  /** Hard cap on workflow tool invocations. */
  maxToolInvocations: number;
  /** Taxonomy that deterministically categorizes PR titles before model use. */
  taxonomy: CategoryTaxonomy;
  /** Optional draft-only cadence configuration. */
  schedule: { enabled: boolean; cron: string; repositories: string[] };
  /** Publication switch. It remains ineffective until the shared VCS write tool exists. */
  publish: { enabled: boolean };
};

const defaultTaxonomy: CategoryTaxonomy = {
  feature: ['feat', 'feature'],
  fix: ['fix', 'bugfix', 'bug'],
  improvement: ['improve', 'enhance', 'perf', 'refactor'],
  breaking: ['breaking change', 'breaking'],
  internal: ['chore', 'ci', 'build', 'deps', 'dependency', 'internal'],
};

/**
 * Reads release-notes configuration and applies bounded defaults.
 *
 * @throws When the required `ai.agents.releaseNotes` section or model is absent.
 */
export const readReleaseNotesConfig = (config: Config): ReleaseNotesConfig => {
  const section = config.getOptionalConfig('ai.agents.releaseNotes');
  if (!section) {
    throw new Error('Release notes requires ai.agents.releaseNotes configuration to be set');
  }

  const taxonomyConfig = section.getOptionalConfig('taxonomy');
  const scheduleConfig = section.getOptionalConfig('schedule');
  const publishConfig = section.getOptionalConfig('publish');
  const taxonomy = {} as CategoryTaxonomy;

  for (const category of Object.keys(defaultTaxonomy) as (keyof CategoryTaxonomy)[]) {
    taxonomy[category] = taxonomyConfig?.getOptionalStringArray(category) ?? defaultTaxonomy[category];
  }

  return {
    modelRef: section.getString('model'),
    maxPullRequests: section.getOptionalNumber('maxPullRequests') ?? 100,
    maxToolInvocations: section.getOptionalNumber('maxToolInvocations') ?? 8,
    taxonomy,
    schedule: {
      enabled: scheduleConfig?.getOptionalBoolean('enabled') ?? false,
      cron: scheduleConfig?.getOptionalString('cron') ?? '0 17 * * 5',
      repositories: scheduleConfig?.getOptionalStringArray('repositories') ?? [],
    },
    publish: { enabled: publishConfig?.getOptionalBoolean('enabled') ?? false },
  };
};
