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
import { CatalogClient } from '@backstage/catalog-client';
import { createPgVectorStore } from '@ai-crew-suite/plugin-kernel-backend-module-storage-pgvector';
import {
  AugmentationOptions,
  createDefaultRetrievalPipeline,
} from '@ai-crew-suite/plugin-kernel-backend-module-retrieval-augmenter';
import { toolExtensionPoint } from '@ai-crew-suite/plugin-kernel-node';
import { OpenAiAugmenter, OpenAiConfig } from './OpenAiAugmenter';

/**
 * OpenAI embeddings backend module for the AI Core backend plugin.
 *
 * The module contributes a retrieval/indexing runtime dependency backed by
 * OpenAI embeddings and pgvector storage. It does not register an executable
 * chat model; deployments still need a model provider module or configured
 * model extension for agent generation.
 *
 * @public
 */
export const aiCoreBackendModuleLlmOpenAi = createBackendModule({
  pluginId: 'ai-providers',
  moduleId: 'openai',
  register(env) {
    env.registerInit({
      deps: {
        auth: coreServices.auth,
        config: coreServices.rootConfig,
        database: coreServices.database,
        discovery: coreServices.discovery,
        logger: coreServices.logger,
        tools: toolExtensionPoint,
      },
      async init({ auth, config, database, discovery, logger, tools }) {
        const vectorStore = await createPgVectorStore({
          logger,
          database,
          config,
        });
        const catalogApi = new CatalogClient({ discoveryApi: discovery });
        logger.info('Initializing OpenAI embeddings');
        const openAiConfig = config.get<OpenAiConfig>('ai.embeddings.openai');
        const embeddingsOptions = config.getOptionalConfig('ai.embeddings');
        const augmentationOptions: AugmentationOptions = {
          chunkSize: embeddingsOptions?.getOptionalNumber('chunkSize'),
          chunkOverlap: embeddingsOptions?.getOptionalNumber('chunkOverlap'),
          concurrencyLimit: embeddingsOptions?.getOptionalNumber('concurrencyLimit'),
        };
        const augmentationIndexer = new OpenAiAugmenter({
          vectorStore,
          catalogApi,
          discovery,
          augmentationOptions,
          logger: logger.child({ label: 'openai-embeddings' }),
          auth,
          config: openAiConfig,
        });
        const retrievalPipeline = createDefaultRetrievalPipeline({
          vectorStore,
          discovery,
          logger,
          auth,
        });

        tools.addTool({
          id: 'openai.embeddings.retrieval',
          description: 'OpenAI embeddings backed retrieval and indexing runtime dependency',
          effect: 'read',
          augmentationIndexer,
          retrievalPipeline,
          async invoke(args: unknown) {
            const payload = args as {
              query: string;
              source: string;
              entityFilter?: Parameters<typeof retrievalPipeline.retrieveAugmentationContext>[2];
            };
            return retrievalPipeline.retrieveAugmentationContext(
              payload.query,
              payload.source,
              payload.entityFilter,
            );
          },
        });
      },
    });
  },
});

export default aiCoreBackendModuleLlmOpenAi;
