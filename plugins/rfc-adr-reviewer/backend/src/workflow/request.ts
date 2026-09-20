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
import type { ReviewRequest } from './state';

/**
 * Error raised for malformed or unsafe RFC/ADR review requests. 
 */
export class ReviewRequestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReviewRequestValidationError';
  }
}

/**
 * Parses and validates an incoming AI Core query payload into a bounded RFC/ADR document request.
 * Enforces version screening, repository string checks, and basic file structure root path checks.
 *
 * @param query - The raw JSON string sent by the system client trigger.
 * @param defaultSource - Default classification fallback if not explicitly defined inside the request string.
 * @returns A validated, type-safe ReviewRequest parameter schema.
 * @throws ReviewRequestValidationError if string decoding fails or fields violate design contracts.
 */
export const parseReviewQuery = (
  query: string,
  defaultSource: ReviewRequest['source']
): ReviewRequest => {
  let raw: unknown;

  try {
    raw = JSON.parse(query);
  } catch {
    throw new ReviewRequestValidationError('Run query must be a JSON ReviewRequest payload');
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ReviewRequestValidationError('Request payload must be a JSON object');
  }

  const value = raw as Record<string, unknown>;

  if (value.version !== 1) {
    throw new ReviewRequestValidationError(`Unsupported request version: ${String(value.version)}`);
  }

  if (typeof value.repoUrl !== 'string' || !value.repoUrl) {
    throw new ReviewRequestValidationError("Request field 'repoUrl' must be a non-empty string");
  }

  if (typeof value.path !== 'string' || !/^(adr|rfc)\//i.test(value.path)) {
    throw new ReviewRequestValidationError(
      "Request field 'path' must identify a document under adr/ or rfc/"
    );
  }

  return {
    version: 1,
    source: value.source === 'events' ? 'events' : defaultSource,
    repoUrl: value.repoUrl,
    path: value.path,
    ref: typeof value.ref === 'string' ? value.ref : undefined,
    pullRequestId: typeof value.pullRequestId === 'string' ? value.pullRequestId : undefined,
  };
};
