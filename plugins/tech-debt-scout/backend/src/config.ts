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

/** Runtime limits and deterministic triage policy for debt scouting. */
export type TechDebtScoutConfig = {
  modelRef: string;
  maxQuestionChars: number;
  maxSignals: number;
  maxToolInvocations: number;
  escalationThreshold: number;
};

/** Reads the bounded scout configuration and rejects unsafe score thresholds. */
export const readTechDebtScoutConfig = (
  config: Config,
): TechDebtScoutConfig => {
  const section = config.getOptionalConfig('ai.agents.techDebtScout');

  if (!section)
    throw new Error(
      'Tech debt scout requires ai.agents.techDebtScout configuration to be set',
    );

  const triage = section.getOptionalConfig('triage');

  const escalationThreshold =
    triage?.getOptionalNumber('escalationThreshold') ?? 5;

  if (escalationThreshold < 1)
    throw new Error('Tech debt scout escalationThreshold must be positive');

  return {
    modelRef: section.getString('model'),
    maxQuestionChars: section.getOptionalNumber('maxQuestionChars') ?? 500,
    maxSignals: section.getOptionalNumber('maxSignals') ?? 100,
    maxToolInvocations: section.getOptionalNumber('maxToolInvocations') ?? 12,
    escalationThreshold,
  };
};
