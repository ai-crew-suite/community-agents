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
  createFrontendPlugin,
  type ExtensionDefinition,
  type FrontendFeature,
} from '@backstage/frontend-plugin-api';
import { catalogAiInsightsApiExtension } from './extensions/api';
import {
  catalogInsightsPageExtension,
  entityInsightsCardExtension,
} from './extensions/components';

const extension = (value: unknown): ExtensionDefinition =>
  value as ExtensionDefinition;

const extensions = [
  extension(catalogAiInsightsApiExtension),
  extension(catalogInsightsPageExtension),
  extension(entityInsightsCardExtension),
];

const createPlugin = createFrontendPlugin as unknown as (options: {
  pluginId: string;
  extensions: readonly ExtensionDefinition[];
}) => FrontendFeature;

/**
 * Alpha (new frontend-system) entry point for catalog AI insights, exposing
 * the API, standalone page, and entity-card extensions as a `FrontendFeature`.
 */
export default createPlugin({
  pluginId: 'catalog-ai-insights',
  extensions,
});
