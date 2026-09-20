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
import { coreServices, createBackendModule } from '@backstage/backend-plugin-api';
import { scaffolderActionsExtensionPoint } from '@backstage/plugin-scaffolder-node';
import { createGenerateInfraAction } from './actions/generateInfra';
import { readScaffolderInfraConfig } from './config';
import { BlueprintResolver } from './services/BlueprintResolver';

/** Registers the verified sandboxed Scaffolder workspace action. */
export const scaffolderInfraActionModule = createBackendModule({
  pluginId: 'scaffolder',
  moduleId: 'ai-infra-action',
  register(env) {
    env.registerInit({
      deps: {
        config: coreServices.rootConfig,
        urlReader: coreServices.urlReader,
        actions: scaffolderActionsExtensionPoint
      },
      async init({ config, urlReader, actions }) {
        const resolved = readScaffolderInfraConfig(config);

        actions.addActions(
          createGenerateInfraAction(
            resolved,
            new BlueprintResolver(urlReader, resolved.sources, resolved.maxBlueprintBytes)
          )
        );
      }
    });
  }
});
