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
import type { VcsProviderId, VcsConfig } from '@ai-crew-suite/plugin-kernel-node';

/**
 * Extracts the active VCS routing keys from application configs.
 * Relies entirely on root SCM parameters for structural credentials.
 */
export const readVcsConfig = (config: Config): VcsConfig => {
  const vcsConfig = config.getOptionalConfig('ai.integrations.vcs');

  if (!vcsConfig) {
    throw new Error(
      'VCS module requires configuration parameters at [ai.integrations.vcs]',
    );
  }

  const provider = vcsConfig.getOptionalString('provider');

  if (!provider) {
    throw new Error(
      'VCS module configuration missing required key [ai.integrations.vcs.provider]',
    );
  }

  // 🌟 FIX: Removed the static array check. Treat provider as an open VcsProviderId.
  // The backend engine plugin handles validation dynamically via its drivers map.
  return { provider: provider as VcsProviderId };
};
