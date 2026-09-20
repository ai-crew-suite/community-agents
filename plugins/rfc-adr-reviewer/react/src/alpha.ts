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
import { rfcAdrReviewerApiExtension } from './extensions/api';
import { rfcAdrReviewerPageExtension } from './extensions/components';

/**
 * Narrowed `createFrontendPlugin` signature. The published typings are wider
 * than the options this plugin supplies, so the cast keeps the alpha entry
 * point compiling without loosening the extension types themselves.
 */
const createPlugin = createFrontendPlugin as unknown as (options: {
  pluginId: string;
  extensions: readonly ExtensionDefinition[];
}) => FrontendFeature;

/**
 * Alpha (new frontend-system) entry point for the RFC/ADR AI reviewer,
 * exposing the typed SSE API and the standalone review page as a
 * `FrontendFeature`.
 */
export default createPlugin({
  pluginId: 'rfc-adr-ai-reviewer',
  extensions: [
    rfcAdrReviewerApiExtension as unknown as ExtensionDefinition,
    rfcAdrReviewerPageExtension as unknown as ExtensionDefinition,
  ],
});
