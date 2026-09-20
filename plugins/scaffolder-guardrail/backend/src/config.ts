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
import type { PolicyViolation } from './workflow/state';

/** Resolved deterministic policy, budget, and alternative configuration. */
export type ScaffolderGuardrailConfig = {
  modelRef: string;
  maxParameterBytes: number;
  maxToolInvocations: number;
  maxNegotiationRounds: number;
  policies: string[];
  severity: Record<string, PolicyViolation['severity']>;
  thresholdUsd: number;
  perEnvironment: Record<string, number>;
  instanceTypeLadder: string[];
  instanceTypeByEnvironment: Record<string, string[]>;
};

/** Reads guardrail configuration and rejects an empty policy plan at boot. */
export const readScaffolderGuardrailConfig = (config: Config): ScaffolderGuardrailConfig => {
  const section = config.getOptionalConfig('ai.agents.scaffolderGuardrail');
  if (!section) {
    throw new Error('Scaffolder guardrail requires ai.agents.scaffolderGuardrail configuration to be set');
  }

  const policies = section.getOptionalConfigArray('policies').map(item => item.getString('id'));
  if (policies.length === 0) {
    throw new Error('Scaffolder guardrail requires at least one configured policy');
  }

  const budget = section.getOptionalConfig('budget');
  const alternatives = section.getOptionalConfig('alternatives');
  const instanceType = alternatives?.getOptionalConfig('instanceType');

  const severityConfig = section.getOptionalConfig('severity');
  const severity: Record<string, PolicyViolation['severity']> = {};
  for (const key of severityConfig?.keys() ?? []) {
    severity[key] = severityConfig?.getString(key) as PolicyViolation['severity'];
  }

  const byEnvironment: Record<string, string[]> = {};
  for (const key of instanceType?.getOptionalConfig('perEnvironment')?.keys() ?? []) {
    byEnvironment[key] = instanceType?.getOptionalConfig('perEnvironment')?.getStringArray(key) ?? [];
  }

  const perEnvironment: Record<string, number> = {};
  for (const key of budget?.getOptionalConfig('perEnvironment')?.keys() ?? []) {
    perEnvironment[key] = budget?.getOptionalConfig('perEnvironment')?.getNumber(key) ?? 0;
  }

  return {
    modelRef: section.getString('model'),
    maxParameterBytes: section.getOptionalNumber('maxParameterBytes') ?? 16_384,
    maxToolInvocations: section.getOptionalNumber('maxToolInvocations') ?? 12,
    maxNegotiationRounds: section.getOptionalNumber('maxNegotiationRounds') ?? 3,
    policies,
    severity,
    thresholdUsd: budget?.getOptionalNumber('thresholdUsd') ?? 1000,
    perEnvironment,
    instanceTypeLadder: instanceType?.getOptionalStringArray('ladder') ?? [],
    instanceTypeByEnvironment: byEnvironment
  };
};
