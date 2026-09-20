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
import {
  CreateCloudProviderToolsOptions,
  ToolDefinition,
} from '@ai-crew-suite/plugin-kernel-node';

/** Creates typed, read-only AI Core tools that delegate to the active cloud driver. */
export const createCloudProviderTools = (
  options: CreateCloudProviderToolsOptions,
): ToolDefinition[] => {
  const { driver, logger } = options;

  return [
    {
      id: 'cloud.account.lookup',
      description: 'Returns a cloud account summary for the active provider.',
      effect: 'read',
      async invoke(args: unknown) {
        const payload = args as { accountId?: string; name?: string };

        logger.debug('cloud.account.lookup invoked', payload);

        return driver.lookupAccount(payload);
      },
    },
    {
      id: 'cloud.resource.lookup',
      description:
        'Returns bounded live cloud resource inventory from the active provider.',
      effect: 'read',
      async invoke(args: unknown) {
        const payload = args as {
          service?: string;
          tags?: Record<string, string>;
          owner?: string;
          catalogEntityRef?: string;
        };

        logger.debug('cloud.resource.lookup invoked', payload);

        return driver.lookupResource(payload);
      },
    },
    {
      id: 'cloud.resource.dependencies',
      description: 'Returns dependency summaries for one cloud resource.',
      effect: 'read',
      async invoke(args: unknown) {
        const payload = args as { resourceId: string };

        logger.debug('cloud.resource.dependencies invoked', payload);

        return driver.resourceDependencies(payload);
      },
    },
  ];
};
