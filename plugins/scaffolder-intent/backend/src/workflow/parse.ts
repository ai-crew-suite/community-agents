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
import type { IntentFacts, IntentRequest } from './state';

/** Raised when a manual intent request is malformed or oversized. */
export class IntentRequestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IntentRequestValidationError';
  }
}

/** Parses a request and extracts only bounded name and kind facts from its utterance. */
export const parseIntentQuery = (
  query: string,
  maxChars: number,
): { request: IntentRequest; facts: IntentFacts } => {
  let raw: unknown;

  try {
    raw = JSON.parse(query);
  } catch {
    throw new IntentRequestValidationError(
      'Run query must be a JSON IntentRequest payload',
    );
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw new IntentRequestValidationError(
      'Request payload must be a JSON object',
    );

  const value = raw as Record<string, unknown>;

  if (
    value.version !== 1 ||
    value.source !== 'manual' ||
    typeof value.utterance !== 'string' ||
    !value.utterance.trim() ||
    value.utterance.length > maxChars
  )
    throw new IntentRequestValidationError(
      `Request requires version 1, source manual, and an utterance up to ${maxChars} characters`,
    );

  const utterance = value.utterance.trim();

  const name = /\b(?:called|named)\s+([a-z0-9-]+)/i
    .exec(utterance)?.[1]
    ?.toLowerCase();

  const kind = /\b(react|node|library|service|app)\b/i
    .exec(utterance)?.[1]
    ?.toLowerCase();

  return {
    request: { version: 1, source: 'manual', utterance },
    facts: { proposedName: name, kind },
  };
};
