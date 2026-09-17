/**
 * Copyright 2024 Larder Software Limited
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
import { createExtensionPoint } from '@backstage/backend-plugin-api';
import type { SourceDescriptor } from '../types';

/**
 * Extension point that allows backend modules to register indexing and retrieval sources
 * (e.g., `catalog`, `techdocs`, or custom third-party integrations) with the central AI agent runtime.
 *
 * Registered sources provide the content pipelines utilized by agentic workflow plugins
 * for embeddings generation, knowledge indexing, and context-aware retrieval.
 */
export interface SourceExtensionPoint {
  addSource(source: SourceDescriptor): void;
}

export const sourceExtensionPoint = createExtensionPoint<SourceExtensionPoint>({
  id: 'plugin-agent.sources',
});