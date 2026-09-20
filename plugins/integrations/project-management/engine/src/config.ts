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
 * Reads the driver selector from `ai.integrations.projectManagement`.
 *
 * Provider connection details are owned by the sibling driver modules, so this
 * reader only resolves which registered driver should back the shared tools.
 */
export const readProjectManagementConfig = (
  config: Config,
): IntegrationProviderConfig => {
  const section = config.getOptionalConfig('ai.integrations.projectManagement');
  if (!section) {
    throw new Error(
      'Project management module requires ai.integrations.projectManagement configuration to be set',
    );
  }

  const provider = section.getOptionalString('provider');
  if (!provider) {
    throw new Error(
      'Project management module requires ai.integrations.projectManagement.provider to be set',
    );
  }

  return { provider };
};
