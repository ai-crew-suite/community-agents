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
import type { CatalogInsightRequest, InsightIntent } from './state';

const MAX_QUESTION_LENGTH = 2_048;
const ENTITY_REF_PATTERN = /^[a-z][a-z0-9-]*(:[a-z0-9-]+)?\/[a-z0-9-._]+$/i;

const INSIGHT_INTENTS: readonly string[] = [
  'ownership-oncall',
  'observability-links',
  'deployment-health',
  'general-context',
];

/**
 * Thrown when an insight request payload fails validation or normalization.
 */
export class InsightRequestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InsightRequestValidationError';
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readRequiredString = (
  payload: Record<string, unknown>,
  key: string,
): string => {
  const value = payload[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new InsightRequestValidationError(
      `Request field '${key}' must be a non-empty string`,
    );
  }
  return value;
};

const readOptionalString = (
  payload: Record<string, unknown>,
  key: string,
): string | undefined => {
  const value = payload[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'string' || value.length === 0) {
    throw new InsightRequestValidationError(
      `Request field '${key}' must be a non-empty string`,
    );
  }
  return value;
};

/**
 * Validates and normalizes a versioned insight request payload into the
 * stable `CatalogInsightRequest` shape consumed by the insights graph.
 *
 * A request must name exactly one catalog entity and carry a bounded
 * natural-language question. Unknown schema versions and malformed entity
 * references are rejected before any tool or model call.
 */
export const normalizeInsightRequest = (
  raw: unknown,
  options: { defaultSource: CatalogInsightRequest['source'] },
): CatalogInsightRequest => {
  if (!isRecord(raw)) {
    throw new InsightRequestValidationError('Request payload must be a JSON object');
  }
  if (raw.version !== 1) {
    throw new InsightRequestValidationError(
      `Unsupported request version: ${String(raw.version)}`,
    );
  }

  const entityRef = readRequiredString(raw, 'entityRef');
  if (!ENTITY_REF_PATTERN.test(entityRef)) {
    throw new InsightRequestValidationError(
      `Request entityRef '${entityRef}' is not a valid catalog entity reference`,
    );
  }

  const question = readRequiredString(raw, 'question').slice(
    0,
    MAX_QUESTION_LENGTH,
  );

  let intentHint: InsightIntent | undefined;
  const rawHint = raw.intentHint;
  if (rawHint !== undefined && rawHint !== null) {
    if (
      typeof rawHint !== 'string' ||
      !INSIGHT_INTENTS.includes(rawHint)
    ) {
      throw new InsightRequestValidationError(
        `Request intentHint must be one of: ${INSIGHT_INTENTS.join(', ')}`,
      );
    }
    intentHint = rawHint as InsightIntent;
  }

  const source = raw.source === 'scheduler' ? 'scheduler' : options.defaultSource;

  return {
    version: 1,
    entityRef,
    question,
    source,
    sessionId: readOptionalString(raw, 'sessionId'),
    intentHint,
  };
};

/**
 * Parses an insight request from the free-form agent run query. The query
 * must be a JSON `CatalogInsightRequest` payload.
 */
export const parseInsightQuery = (
  query: string,
  options: { defaultSource: CatalogInsightRequest['source'] },
): CatalogInsightRequest => {
  try {
    return normalizeInsightRequest(JSON.parse(query), options);
  } catch (error) {
    if (error instanceof InsightRequestValidationError) {
      throw error;
    }
    throw new InsightRequestValidationError(
      'Run query must be a JSON CatalogInsightRequest payload',
    );
  }
};
