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
import type { AlertTuningRequest } from './state';

/** Error raised for malformed or unsafe alert tuning requests. */
export class AlertTuningRequestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AlertTuningRequestValidationError';
  }
}

/** Rejects traversal and absolute paths before a path reaches a read tool. */
const isSafePath = (path: string): boolean =>
  path.length > 0 &&
  path.length <= 512 &&
  !path.startsWith('/') &&
  !path.split('/').includes('..');

const optionalString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

/**
 * Parses and validates an AI Core run query into a bounded tuning request.
 * Requires an `alertId` or a `service`, clamps the analysis window, and rejects
 * unsafe IaC paths and unknown payload versions.
 *
 * @param query - Raw JSON payload supplied in `AgentRunInput.input.query`.
 * @param defaultSource - Trigger classification used when the payload omits one.
 * @param windowBounds - Default and hard-maximum trailing window in days.
 * @throws AlertTuningRequestValidationError when the payload violates the contract.
 */
export const parseAlertTuningQuery = (
  query: string,
  defaultSource: AlertTuningRequest['source'],
  windowBounds: { defaultDays: number; maxDays: number }
): AlertTuningRequest => {
  let raw: unknown;

  try {
    raw = JSON.parse(query);
  } catch {
    throw new AlertTuningRequestValidationError(
      'Run query must be a JSON AlertTuningRequest payload'
    );
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new AlertTuningRequestValidationError('Request payload must be a JSON object');
  }

  const value = raw as Record<string, unknown>;

  if (value.version !== 1) {
    throw new AlertTuningRequestValidationError(
      `Unsupported request version: ${String(value.version)}`
    );
  }

  const alertId = optionalString(value.alertId);
  const service = optionalString(value.service);

  if (!alertId && !service) {
    throw new AlertTuningRequestValidationError(
      "Request requires 'alertId' or 'service' to scope the evaluation"
    );
  }

  const iacPath = optionalString(value.iacPath);

  if (iacPath && !isSafePath(iacPath)) {
    throw new AlertTuningRequestValidationError(
      "Request field 'iacPath' must be a bounded repository-relative path"
    );
  }

  const requestedDays =
    typeof value.windowDays === 'number' && Number.isFinite(value.windowDays)
      ? Math.floor(value.windowDays)
      : windowBounds.defaultDays;

  return {
    version: 1,
    source: value.source === 'scheduler' ? 'scheduler' : defaultSource,
    alertId,
    service,
    entityRef: optionalString(value.entityRef),
    windowDays: Math.min(Math.max(requestedDays, 1), windowBounds.maxDays),
    repoUrl: optionalString(value.repoUrl),
    iacPath,
    publish: value.publish === true,
  };
};

/**
 * Derives the inclusive analysis window for a validated request.
 *
 * @param request - The validated request carrying the clamped `windowDays`.
 * @param now - Injectable clock, keeping window derivation deterministic in tests.
 */
export const resolveWindow = (
  request: AlertTuningRequest,
  now: () => Date = () => new Date()
): { from: string; to: string } => {
  const to = now();
  const from = new Date(to.getTime() - (request.windowDays ?? 14) * 24 * 60 * 60 * 1000);

  return { from: from.toISOString(), to: to.toISOString() };
};
