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
import { z } from 'zod';

/**
 * Stable identifier for a retrieval or indexing source, such as `catalog`,
 * `techdocs`, or a custom source contributed by another backend module.
 */
export type SourceId = string;

/**
 * Source identifier used by embedding, indexing, and retrieval APIs.
 */
export const EmbeddingsSourceSchema = z.string().min(1);

export type EmbeddingsSource = z.infer<typeof EmbeddingsSourceSchema>;

/**
 * Describes a source that can provide content for embedding and retrieval.
 */
export type SourceDescriptor = {
  /** Unique source identifier used in config, API requests, and retrieval filters. */
  id: SourceId;
  /** Human-readable description of the source and the content it represents. */
  description?: string;
};

/**
 * ============================================================================
 *   CORE ENGINE REGISTRIES
 * ============================================================================
 */

/**
 * Registry of source descriptors known to the AI backend runtime.
 */
export interface SourceRegistry {
  /** Adds a source descriptor to the registry. Implementations should reject duplicate IDs. */
  register(source: SourceDescriptor): void;
  /** Returns all registered sources in registry order. */
  list(): SourceDescriptor[];
  /** Returns whether a source with the supplied ID has been registered. */
  has(id: SourceId): boolean;
}

/**
 * ============================================================================
 *   STORAGE METADATA & QUERY FILTER SHAPES
 * ============================================================================
 */

/**
 * Metadata stored alongside an embedded document.
 *
 * Values are strings so they can be passed through common vector-store filter
 * implementations without needing source-specific serialization logic.
 */
export type EmbeddingDocMetadata = Record<string, string>;

/**
 * Optional Backstage entity-style filter accepted by indexing and retrieval APIs.
 */
const PrimitiveSchema = z.union([z.string(), z.symbol()]);

const FilterValueSchema = z.union([
  PrimitiveSchema,
  z.array(PrimitiveSchema)
]);

const RecordFilterSchema = z.record(z.string(), FilterValueSchema);

export const EntityFilterShapeSchema = z.union([
  z.array(RecordFilterSchema),
  RecordFilterSchema
]).optional();

export type EntityFilterShape = z.infer<typeof EntityFilterShapeSchema>;
