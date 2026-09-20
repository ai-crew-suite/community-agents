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
import type { BlueprintSource } from './workflow/state';

/** Resolved bounded configuration for deterministic approved-blueprint generation. */
export type ScaffolderInfraConfig = {
  modelRef: string;
  maxBlueprintBytes: number;
  maxGeneratedBytes: number;
  maxFiles: number;
  maxToolInvocations: number;
  maxCorrectionRounds: number;
  allowOverwrite: boolean;
  sources: BlueprintSource[];
  maxCpu: number;
  maxMemoryMb: number;
  maxStorageGb: number;
  allowedRegions: string[];
};

/** Reads config and rejects empty/unrecognized approved blueprint source lists at boot. */
export const readScaffolderInfraConfig = (config: Config): ScaffolderInfraConfig => {
  const section = config.getOptionalConfig('ai.agents.scaffolderInfra');
  if (!section) {
    throw new Error('Scaffolder infra requires ai.agents.scaffolderInfra configuration to be set');
  }

  const blueprints = section.getOptionalConfig('blueprints');
  const sources = blueprints?.getOptionalConfigArray('sources').map(item => ({
    id: item.getString('id'),
    provider: item.getString('provider') as BlueprintSource['provider'],
    url: item.getString('url')
  })) ?? [];

  if (
    sources.length === 0 ||
    sources.some(source => source.provider !== 'terraform' && source.provider !== 'cloudformation')
  ) {
    throw new Error('Scaffolder infra requires non-empty approved terraform/cloudformation blueprint sources');
  }

  const capacity = section.getOptionalConfig('capacity');

  return {
    modelRef: section.getString('model'),
    maxBlueprintBytes: section.getOptionalNumber('maxBlueprintBytes') ?? 65_536,
    maxGeneratedBytes: section.getOptionalNumber('maxGeneratedBytes') ?? 131_072,
    maxFiles: section.getOptionalNumber('maxFiles') ?? 8,
    maxToolInvocations: section.getOptionalNumber('maxToolInvocations') ?? 10,
    maxCorrectionRounds: section.getOptionalNumber('maxCorrectionRounds') ?? 2,
    allowOverwrite: section.getOptionalBoolean('allowOverwrite') ?? false,
    sources,
    maxCpu: capacity?.getOptionalNumber('maxCpu') ?? 8,
    maxMemoryMb: capacity?.getOptionalNumber('maxMemoryMb') ?? 16_384,
    maxStorageGb: capacity?.getOptionalNumber('maxStorageGb') ?? 512,
    allowedRegions: section.getOptionalStringArray('allowedRegions') ?? []
  };
};
