/*
 * Copyright 2026 The AI Crew Suite Authors
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and limitations under the License.
 */
import { Config } from '@backstage/config';

/** Bounded configuration for direct-dependency radar analysis. */
export type TechRadarConfig = {
  modelRef: string;
  radarSourceUrl: string;
  maxToolInvocations: number;
  assessToTrialRatio: number;
};

/** Reads required radar source configuration and deterministic promotion threshold. */
export const readTechRadarConfig = (config: Config): TechRadarConfig => {
  const section = config.getOptionalConfig('ai.agents.techRadarManager');

  if (!section)
    throw new Error(
      'Tech radar manager requires ai.agents.techRadarManager configuration to be set',
    );

  const threshold =
    section
      .getOptionalConfig('thresholds')
      ?.getOptionalNumber('assessToTrialRatio') ?? 0.3;

  if (threshold <= 0 || threshold > 1)
    throw new Error(
      'Tech radar assessToTrialRatio must be between zero and one',
    );

  return {
    modelRef: section.getString('model'),
    radarSourceUrl: section.getConfig('radar').getString('sourceUrl'),
    maxToolInvocations: section.getOptionalNumber('maxToolInvocations') ?? 8,
    assessToTrialRatio: threshold,
  };
};
