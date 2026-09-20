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

/** Resolved bounded runtime configuration for the read-only drift detector. */
export type DriftDetectorConfig = {
  modelRef: string;
  maxInfraFiles: number;
  maxDriftItems: number;
  maxToolInvocations: number;
  infraPaths: string[];
  sweep: {
    enabled: boolean;
    cron: string;
    maxSweepComponents: number;
    entityRefs: string[]
  };
  remediate: { enabled: boolean };
};

/** Reads drift detector configuration, failing at boot if the model is absent. */
export const readDriftDetectorConfig = (config: Config): DriftDetectorConfig => {
  const section = config.getOptionalConfig('ai.agents.driftDetector');
  if (!section) {
    throw new Error('Drift detector requires ai.agents.driftDetector configuration to be set');
  }

  const sweep = section.getOptionalConfig('sweep');
  const remediate = section.getOptionalConfig('remediate');

  return {
    modelRef: section.getString('model'),
    maxInfraFiles: section.getOptionalNumber('maxInfraFiles') ?? 8,
    maxDriftItems: section.getOptionalNumber('maxDriftItems') ?? 40,
    maxToolInvocations: section.getOptionalNumber('maxToolInvocations') ?? 18,
    infraPaths: section.getOptionalStringArray('infraPaths') ?? [
      'main.tf',
      'deployment.yaml',
      'k8s/**'
    ],
    sweep: {
      enabled: sweep?.getOptionalBoolean('enabled') ?? false,
      cron: sweep?.getOptionalString('cron') ?? '0 */24 * * *',
      maxSweepComponents: sweep?.getOptionalNumber('maxSweepComponents') ?? 50,
      entityRefs: sweep?.getOptionalStringArray('entityRefs') ?? []
    },
    remediate: {
      enabled: remediate?.getOptionalBoolean('enabled') ?? false
    },
  };
};
