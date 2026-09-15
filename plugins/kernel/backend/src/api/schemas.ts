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
 * ============================================================================
 *   Shared Base Filters & Preprocessors
 * ============================================================================
 */

const FilterValueSchema = z.union([
  z.string(),
  z.symbol(),
  z.array(z.union([z.string(), z.symbol()]))
]);

const FilterRecordSchema = z.record(z.string(), FilterValueSchema);

/**
 * Validates the core structural shape matching EntityFilterShape contracts.
 */
export const EntityFilterZodSchema = z.union([
  FilterRecordSchema,
  z.array(FilterRecordSchema)
]).optional();

/**
 * URL query parser that safely intercept query string structures, parses them
 * via JSON, and validates them against the EntityFilter footprint.
 */
export const QueryEntityFilterZodSchema = z.preprocess((val) => {
  if (typeof val !== 'string') return undefined;
  try {
    return JSON.parse(val);
  } catch {
    return undefined;
  }
}, EntityFilterZodSchema);

/**
 * ============================================================================
 *   Endpoint Specific Request Schemas
 * ============================================================================
 */

export const ApproveRunParamsSchema = z.object({
  id: z.string().min(1, 'Run tracking identifier parameter is required'),
});

export const ApproveRunBodySchema = z.object({
  status: z.enum(['approved', 'rejected']),
  note: z.string().optional(),
});

export const CreateEmbeddingsSchema = z.object({
  query: z.string().min(1, 'input.query is required'),
  source: z.string().optional(),
  entityFilter: EntityFilterZodSchema
});

export const DeleteEmbeddingsSchema = z.object({
  source: z.string().min(1, 'input.source is required'),
  entityFilter: EntityFilterZodSchema
});

export const GetEmbeddingsQuerySchema = z.object({
  query: z.string().min(1, 'query query param is required'),
  source: z.string().optional(),
  entityFilter: QueryEntityFilterZodSchema
});

export const StartRunParamsSchema = z.object({
  id: z.string().min(1, 'Agent tracking identifier parameter is required'),
});

export const StartRunBodySchema = z.object({
  query: z.string().min(1, 'input.query is required'),
});

export const StreamRunParamsSchema = z.object({
  id: z.string().min(1, 'Run tracking identifier is required'),
});

export const TriggerRunParamsSchema = z.object({
  source: z.string().min(1, 'Trigger payload source parameter is required'),
});

export const WebhookRunParamsSchema = z.object({
  provider: z.string().min(1, 'Webhook payload provider parameter is required'),
});

export const GenericEventPayloadSchema = z.object({
  triggerId: z.string().min(1, 'triggerId identifier mapping is required'),
  query: z.string().default('Automated background trigger event processing payload pass.'),
});

/**
 * ============================================================================
 *   Strongly Typed Contract Inferences
 * ============================================================================
 */

export type ApproveRunBody = z.infer<typeof ApproveRunBodySchema>;
export type ApproveRunParams = z.infer<typeof ApproveRunParamsSchema>;
export type CreateEmbeddingsInput = z.infer<typeof CreateEmbeddingsSchema>;
export type DeleteEmbeddingsInput = z.infer<typeof DeleteEmbeddingsSchema>;
export type GenericEventPayload = z.infer<typeof GenericEventPayloadSchema>;
export type GetEmbeddingsInput = z.infer<typeof GetEmbeddingsQuerySchema>;
export type StartRunBody = z.infer<typeof StartRunBodySchema>;
export type StartRunParams = z.infer<typeof StartRunParamsSchema>;
export type StreamRunParams = z.infer<typeof StreamRunParamsSchema>;
export type TriggerRunParams = z.infer<typeof TriggerRunParamsSchema>;
export type WebhookRunParams = z.infer<typeof WebhookRunParamsSchema>;
