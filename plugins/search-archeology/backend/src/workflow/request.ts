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
import type { ArcheologyRequest } from './state';

/** Raised for unsafe, oversized, or unscoped archeology requests. */
export class ArcheologyRequestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArcheologyRequestValidationError';
  }
}

/** Parses a bounded question and clamps its history window to configured years. */
export const parseArcheologyQuery = (
  query: string,
  maxQuestionChars: number,
  maxLookbackYears: number,
  now: () => Date = () => new Date()
): ArcheologyRequest => {
  let raw: unknown;
  try {
    raw = JSON.parse(query);
  } catch {
    throw new ArcheologyRequestValidationError('Run query must be a JSON ArcheologyRequest payload');
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ArcheologyRequestValidationError('Request payload must be a JSON object');
  }

  const value = raw as Record<string, unknown>;
  if (value.version !== 1) {
    throw new ArcheologyRequestValidationError(`Unsupported request version: ${String(value.version)}`);
  }

  if (typeof value.question !== 'string' || !value.question.trim() || value.question.length > maxQuestionChars) {
    throw new ArcheologyRequestValidationError(
      `Request field 'question' must be a non-empty string up to ${maxQuestionChars} characters`
    );
  }

  if (typeof value.repoUrl !== 'string' && typeof value.entityRef !== 'string') {
    throw new ArcheologyRequestValidationError("Request requires 'repoUrl' or 'entityRef' scope");
  }

  const until = typeof value.until === 'string' ? value.until : now().toISOString();
  const floor = new Date(now().getTime() - maxLookbackYears * 365 * 24 * 60 * 60 * 1000).toISOString();
  const since = typeof value.since === 'string' && value.since > floor ? value.since : floor;

  const paths = Array.isArray(value.paths)
    ? value.paths
        .filter((path): path is string => typeof path === 'string' && path.length <= 512 && !path.includes('..'))
        .slice(0, 10)
    : undefined;

  return {
    version: 1,
    source: 'manual',
    question: value.question.trim(),
    entityRef: typeof value.entityRef === 'string' ? value.entityRef : undefined,
    repoUrl: typeof value.repoUrl === 'string' ? value.repoUrl : undefined,
    paths,
    since,
    until,
    sessionId: typeof value.sessionId === 'string' ? value.sessionId : undefined
  };
};
