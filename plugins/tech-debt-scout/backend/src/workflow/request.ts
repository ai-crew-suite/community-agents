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
import type { DebtScoutRequest } from './state';

/** Raised when an unscoped or oversized debt scan is requested. */
export class DebtScoutRequestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DebtScoutRequestValidationError';
  }
}

/** Parses one versioned, repository-scoped manual scan request. */
export const parseDebtScoutQuery = (
  query: string,
  maxQuestionChars: number,
): DebtScoutRequest => {
  let raw: unknown;

  try {
    raw = JSON.parse(query);
  } catch {
    throw new DebtScoutRequestValidationError(
      'Run query must be a JSON DebtScoutRequest payload',
    );
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw new DebtScoutRequestValidationError(
      'Request payload must be a JSON object',
    );

  const value = raw as Record<string, unknown>;

  if (value.version !== 1)
    throw new DebtScoutRequestValidationError(
      `Unsupported request version: ${String(value.version)}`,
    );

  if (typeof value.repoUrl !== 'string' || !/^https?:\/\//.test(value.repoUrl))
    throw new DebtScoutRequestValidationError(
      "Request field 'repoUrl' must be an HTTP(S) repository URL",
    );

  if (
    value.question !== undefined &&
    (typeof value.question !== 'string' ||
      value.question.length > maxQuestionChars)
  )
    throw new DebtScoutRequestValidationError(
      `Request field 'question' must be up to ${maxQuestionChars} characters`,
    );

  return {
    version: 1,
    source: 'manual',
    repoUrl: value.repoUrl,
    entityRef:
      typeof value.entityRef === 'string' ? value.entityRef : undefined,
    question:
      typeof value.question === 'string' ? value.question.trim() : undefined,
  };
};
