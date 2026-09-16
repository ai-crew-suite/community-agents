/*
 * Copyright 2025 Larder Software Limited
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
import { createPgVectorStore } from '../../../vector/pgvector/src';
import {
	AugmentationOptions,
	createDefaultRetrievalPipeline,
} from '@ai-crew-suite/plugin-retrieval-augmenter-backend';
import { toolExtensionPoint } from '@ai-crew-suite/plugin-kernel-node';
import { BedrockAugmenter, BedrockConfig } from './BedrockAugmenter';

const getBedrockRegion = () =>
	process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? 'us-east-1';

/**
 * AWS Bedrock embeddings backend module for the AI Core backend plugin.
 *
 * The module contributes a retrieval/indexing runtime dependency backed by
 * Bedrock embeddings and pgvector storage. It does not register an executable
 * chat model; deployments still need a model provider module or configured
 * model extension for agent generation.
 *
 * @public
 */
export const aiCoreBackendModuleLlmAws = createBackendModule({
	pluginId: 'ai-providers',
	moduleId: 'aws-bedrock',
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
				logger.info('Initializing AWS Bedrock embeddings');
				const bedrockConfig = config.get<BedrockConfig>('ai.embeddings.bedrock');
				const embeddingsOptions = config.getOptionalConfig('ai.embeddings');
				const augmentationOptions: AugmentationOptions = {
					chunkSize: embeddingsOptions?.getOptionalNumber('chunkSize'),
					chunkOverlap: embeddingsOptions?.getOptionalNumber('chunkOverlap'),
					concurrencyLimit: embeddingsOptions?.getOptionalNumber('concurrencyLimit'),
				};
				const augmentationIndexer = new BedrockAugmenter({
					vectorStore,
					catalogApi,
					discovery,
					logger: logger.child({ label: 'aws-bedrock-embedder' }),
					auth,
					options: {
						region: config.getOptionalString('ai.embeddings.bedrock.region') ?? getBedrockRegion(),
					},
					bedrockConfig,
					augmentationOptions,
				});
				const retrievalPipeline = createDefaultRetrievalPipeline({
					vectorStore,
					discovery,
					logger,
					auth,
				});

				tools.addTool({
					id: 'aws.bedrock.retrieval',
					description: 'AWS Bedrock embeddings backed retrieval and indexing runtime dependency',
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

export default aiCoreBackendModuleLlmAws;
