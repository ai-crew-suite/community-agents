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
import type { PrdRequest, PrdSpan } from './state';

/** Raised for malformed or oversized PRD submissions. */
export class PrdRequestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PrdRequestValidationError';
  }
}

/** Parses inline PRD text into citable non-empty line spans. */
export const parsePrd = (
  query: string,
  maxChars: number,
): { request: PrdRequest; spans: PrdSpan[] } => {
  let raw: unknown;

  try {
    raw = JSON.parse(query);
  } catch {
    throw new PrdRequestValidationError(
      'Run query must be a JSON PrdRequest payload',
    );
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw new PrdRequestValidationError(
      'Request payload must be a JSON object',
    );

  const value = raw as Record<string, unknown>;

  if (
    value.version !== 1 ||
    value.source !== 'manual' ||
    typeof value.prdText !== 'string' ||
    !value.prdText.trim() ||
    value.prdText.length > maxChars
  )
    throw new PrdRequestValidationError(
      `Request requires PRD text up to ${maxChars} characters`,
    );

  const prdText = value.prdText.trim();

  return {
    request: {
      version: 1,
      source: 'manual',
      prdText,
      title: typeof value.title === 'string' ? value.title.trim() : undefined,
    },
    spans: prdText
      .split(/\n+/)
      .map(text => text.trim())
      .filter(Boolean)
      .map((text, index) => ({ id: `prd-${index + 1}`, text })),
  };
};
