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
import type { GuardrailRequest } from './state';

/** Raised when an inbound Scaffolder request cannot be bounded safely. */
export class GuardrailRequestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GuardrailRequestValidationError';
  }
}

const secretKey = /token|password|secret|api[-_]?key|connection[-_]?string/i;

/** Canonicalizes JSON-compatible parameter data and redacts secret-shaped values. */
export const canonicalizeParameters = (value: unknown, key = ''): unknown => {
  if (secretKey.test(key)) return '[REDACTED]';
  if (Array.isArray(value)) return value.map(item => canonicalizeParameters(item));

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, item]) => [name, canonicalizeParameters(item, name)])
    );
  }

  if (typeof value === 'string') return value.trim().toLowerCase();
  return value;
};

/** Parses, validates, caps, and redacts an inbound guardrail request. */
export const parseGuardrailQuery = (
  query: string,
  source: GuardrailRequest['source'],
  maxBytes: number
): GuardrailRequest => {
  let raw: unknown;
  try {
    raw = JSON.parse(query);
  } catch {
    throw new GuardrailRequestValidationError('Run query must be a JSON GuardrailRequest payload');
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new GuardrailRequestValidationError('Request payload must be a JSON object');
  }

  const value = raw as Record<string, unknown>;
  if (value.version !== 1) {
    throw new GuardrailRequestValidationError(`Unsupported request version: ${String(value.version)}`);
  }

  if (typeof value.templateRef !== 'string' || !value.templateRef.trim()) {
    throw new GuardrailRequestValidationError("Request field 'templateRef' must be a non-empty string");
  }

  if (
    !value.parameters ||
    typeof value.parameters !== 'object' ||
    Array.isArray(value.parameters) ||
    Object.keys(value.parameters as object).length === 0
  ) {
    throw new GuardrailRequestValidationError("Request field 'parameters' must be a non-empty object");
  }

  const parameters = canonicalizeParameters(value.parameters) as Record<string, unknown>;
  if (Buffer.byteLength(JSON.stringify(parameters), 'utf8') > maxBytes) {
    throw new GuardrailRequestValidationError(`Request parameters exceed the ${maxBytes} byte limit`);
  }

  return {
    version: 1,
    source: value.source === 'preflight' ? 'preflight' : source,
    templateRef: value.templateRef.trim(),
    parameters,
    environment: typeof value.environment === 'string'
      ? value.environment.trim().toLowerCase()
      : undefined,
    requestedBy: typeof value.requestedBy === 'string' ? value.requestedBy.trim() : undefined,
    sessionId: typeof value.sessionId === 'string' ? value.sessionId.trim() : undefined
  };
};
