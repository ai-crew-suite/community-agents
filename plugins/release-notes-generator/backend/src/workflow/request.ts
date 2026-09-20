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
import type { ReleaseNotesRequest } from './state';

/** Error raised for malformed release-note run payloads. */
export class ReleaseNotesRequestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReleaseNotesRequestValidationError';
  }
}

/** Parses the generic agent query into a bounded repository release request. */
export const parseReleaseNotesQuery = (
  query: string,
  defaultSource: ReleaseNotesRequest['source'],
): ReleaseNotesRequest => {
  let raw: unknown;
  try {
    raw = JSON.parse(query);
  } catch {
    throw new ReleaseNotesRequestValidationError('Run query must be a JSON ReleaseNotesRequest payload');
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ReleaseNotesRequestValidationError('Request payload must be a JSON object');
  }
  const value = raw as Record<string, unknown>;
  if (value.version !== 1) {
    throw new ReleaseNotesRequestValidationError(`Unsupported request version: ${String(value.version)}`);
  }
  if (typeof value.repoUrl !== 'string' || !value.repoUrl) {
    throw new ReleaseNotesRequestValidationError("Request field 'repoUrl' must be a non-empty string");
  }
  if (typeof value.targetVersion !== 'string' || !value.targetVersion) {
    throw new ReleaseNotesRequestValidationError("Request field 'targetVersion' must be a non-empty string");
  }
  for (const key of ['since', 'until'] as const) {
    if (value[key] !== undefined && (typeof value[key] !== 'string' || Number.isNaN(Date.parse(value[key] as string)))) {
      throw new ReleaseNotesRequestValidationError(`Request field '${key}' must be an ISO timestamp`);
    }
  }
  return { version: 1, source: value.source === 'scheduler' ? 'scheduler' : defaultSource, repoUrl: value.repoUrl, targetVersion: value.targetVersion, since: value.since as string | undefined, until: value.until as string | undefined };
};
