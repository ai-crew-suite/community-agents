/**
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
import type {
  VectorStoreDefinition,
} from '../types';

/**
 * Extension point that allows concrete storage engine modules (e.g., pgvector, Qdrant, Milvus)
 * to register physical vector database instances with the central Vector Databases engine.
 *
 * This point abstracts vector persistence layers completely away from core LLM logic,
 * delivering standardized similarity search and indexing interfaces across your 18 agentic plugins.
 */
export interface VectorStoreExtensionPoint {
  addVectorStore(d: VectorStoreDefinition): void
}

export const vectorStoreExtensionPoint = createExtensionPoint<VectorStoreExtensionPoint>({
  id: 'databases-vector.vector-stores',
});
