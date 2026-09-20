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

/**
 * Resolved runtime configuration for the on-call handover module.
 */
export type OncallHandoverConfig = {
  /** Reference model pointer identifier mapped to the execution engine. */
  modelRef: string;
  /** Lookback window width measured in hours. */
  windowHours: number;
  /** System limit cap preventing broad trailing history fetches. */
  maxWindowHours: number;
  /** Maximum entry log limits fetched across separate source integrations. */
  maxSignalsPerSource: number;
  /** Upper bound limit for grouping repeated incident rows. */
  maxClusters: number;
  /** Total high-priority groups selected for runbook context enrichment. */
  maxEnrichedClusters: number;
  /** Call limits allowed for tool tracking before budget exhaustion. */
  maxToolInvocations: number;
  /** Background automation parameters. */
  schedule: {
    /** True if automated background crontab triggering is active. */
    enabled: boolean;
    /** Ordered list of structured scheduled tasks target parameters. */
    shifts: { cron: string; team: string }[];
  };
};

/**
 * Reads user-specified model parameters and applies bounded operational defaults.
 * Throws structural errors if the foundational identifier path is omitted.
 *
 * @param config - The app-config schema tree block provided by the environment framework.
 * @returns A parsed, type-safe OncallHandoverConfig configuration object.
 */
export const readOncallHandoverConfig = (config: Config): OncallHandoverConfig => {
  const section = config.getOptionalConfig('ai.agents.oncallHandover');

  if (!section) {
    throw new Error('On-call handover requires ai.agents.oncallHandover configuration to be set');
  }

  const schedule = section.getOptionalConfig('schedule');
  const maxWindowHours = section.getOptionalNumber('maxWindowHours') ?? 48;
  const windowHours = section.getOptionalNumber('windowHours') ?? 12;

  return {
    modelRef: section.getString('model'),
    windowHours: Math.min(windowHours, maxWindowHours),
    maxWindowHours,
    maxSignalsPerSource: section.getOptionalNumber('maxSignalsPerSource') ?? 100,
    maxClusters: section.getOptionalNumber('maxClusters') ?? 25,
    maxEnrichedClusters: section.getOptionalNumber('maxEnrichedClusters') ?? 5,
    maxToolInvocations: section.getOptionalNumber('maxToolInvocations') ?? 16,
    schedule: {
      enabled: schedule?.getOptionalBoolean('enabled') ?? false,
      shifts:
        schedule?.getOptionalConfigArray('shifts').map((s) => ({
          cron: s.getString('cron'),
          team: s.getString('team'),
        })) ?? [],
    },
  };
};
