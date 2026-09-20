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
import { techdocsJanitorApiExtension } from './extensions/api';
import { techdocsJanitorPageExtension } from './extensions/components';

const createPlugin = createFrontendPlugin as unknown as (options: {
  pluginId: string;
  extensions: readonly ExtensionDefinition[];
}) => FrontendFeature;

/** Alpha entry point exposing the TechDocs audit API and standalone page. */
export default createPlugin(
  {
    pluginId: 'techdocs-ai-janitor',
    extensions: [
      techdocsJanitorApiExtension as unknown as ExtensionDefinition,
      techdocsJanitorPageExtension as unknown as ExtensionDefinition,
    ],
  },
);
