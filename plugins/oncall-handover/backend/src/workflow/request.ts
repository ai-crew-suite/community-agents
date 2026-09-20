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
import type { HandoverRequest } from './state';

/** Validation failure for malformed or unscoped handover requests. */
export class HandoverRequestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HandoverRequestValidationError';
  }
}

/** Parses and validates the generic agent query payload. */
export const parseHandoverQuery = (
  query: string,
  defaultSource: HandoverRequest['source']
): HandoverRequest => {
  let raw: unknown;

  try {
    raw = JSON.parse(query);
  } catch {
    throw new HandoverRequestValidationError('Run query must be a JSON HandoverRequest payload');
  }

  if (typeof raw !== 'object' || !raw || Array.isArray(raw)) {
    throw new HandoverRequestValidationError('Request payload must be a JSON object');
  }

  const v = raw as Record<string, unknown>;

  if (v.version !== 1) {
    throw new HandoverRequestValidationError(`Unsupported request version: ${String(v.version)}`);
  }

  const team = typeof v.team === 'string' && v.team ? v.team : undefined;
  
  const entityRefs =
    Array.isArray(v.entityRefs) && v.entityRefs.every((x) => typeof x === 'string' && x)
      ? (v.entityRefs as string[])
      : undefined;

  if (!team && (!entityRefs || !entityRefs.length)) {
    throw new HandoverRequestValidationError("Request must specify 'team' or non-empty 'entityRefs'");
  }

  if (v.endsAt !== undefined && (typeof v.endsAt !== 'string' || Number.isNaN(Date.parse(v.endsAt)))) {
    throw new HandoverRequestValidationError("Request field 'endsAt' must be an ISO timestamp");
  }

  if (v.windowHours !== undefined && (typeof v.windowHours !== 'number' || v.windowHours <= 0)) {
    throw new HandoverRequestValidationError("Request field 'windowHours' must be a positive number");
  }

  return {
    version: 1,
    source: v.source === 'scheduler' ? 'scheduler' : defaultSource,
    windowHours: v.windowHours as number | undefined,
    endsAt: v.endsAt as string | undefined,
    team,
    entityRefs,
    incomingEngineer: typeof v.incomingEngineer === 'string' ? v.incomingEngineer : undefined,
  };
};
