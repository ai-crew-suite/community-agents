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
import { CloudProvidersConfig } from '@ai-crew-suite/plugin-kernel-node';

export const readCloudProvidersConfig = (
  config: Config,
): CloudProvidersConfig => {
  const cloudConfig = config.getOptionalConfig(
    'ai.integrations.cloudProviders',
  );

  if (!cloudConfig) {
    throw new Error(
      'Cloud providers module requires ai.integrations.cloudProviders configuration to be set',
    );
  }

  const defaultProvider = cloudConfig.getOptionalString(
    'defaultProvider',
  ) as any;

  if (!defaultProvider) {
    throw new Error(
      'Cloud providers module requires ai.integrations.cloudProviders.defaultProvider to be set',
    );
  }

  const providers: any = {};
  const rootObj = cloudConfig.getOptional('providers') || {};

  // Extract keys dynamically to support open-ended driver vendor namespaces
  for (const providerId of Object.keys(rootObj)) {
    const providerConfig = cloudConfig.getOptionalConfig(
      `providers.${providerId}`,
    );

    if (providerConfig) {
      providers[providerId] = {
        region: providerConfig.getOptionalString('region'),
      };
    }
  }

  return { defaultProvider, providers };
};
