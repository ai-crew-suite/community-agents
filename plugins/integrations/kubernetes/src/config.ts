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
import { IntegrationProviderConfig } from '@ai-crew-suite/plugin-kernel-node';

/**
 * Reads the diagnostics driver selector from `ai.integrations.kubernetes`.
 */
export const readKubernetesConfig = (
  config: Config,
): IntegrationProviderConfig => {
  const section = config.getOptionalConfig('ai.integrations.kubernetes');
  if (!section) {
    throw new Error(
      'Kubernetes module requires ai.integrations.kubernetes configuration to be set',
    );
  }

  const provider = section.getOptionalString('provider');
  if (!provider) {
    throw new Error(
      'Kubernetes module requires ai.integrations.kubernetes.provider to be set',
    );
  }

  return { provider };
};
