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
  coreServices,
  createBackendModule,
} from '@backstage/backend-plugin-api';
import { modelExtensionPoint } from '@ai-crew-suite/plugin-kernel-node';
import { createOpenRouterModels, OpenRouterConfig } from './OpenRouterModel';

/**
 * OpenRouter model backend module for the AI Core backend plugin.
 *
 * The module contributes LangChain `ChatOpenRouter` model instances to the AI
 * backend model registry. Retrieval and indexing should be supplied by a
 * separate embeddings module.
 *
 * @public
 */
export const aiCoreBackendModuleLlmOpenRouter = createBackendModule({
  pluginId: 'ai-providers',
  moduleId: 'openrouter',
  register(env) {
    env.registerInit({
      deps: {
        config: coreServices.rootConfig,
        logger: coreServices.logger,
        models: modelExtensionPoint,
      },
      async init({ config, logger, models }) {
        logger.info('Initializing OpenRouter models');
        for (const model of createOpenRouterModels({
          config: config.get<OpenRouterConfig>('ai.models.openrouter'),
          logger,
        })) {
          models.addModel(model);
        }
      },
    });
  },
});

export default aiCoreBackendModuleLlmOpenRouter;
