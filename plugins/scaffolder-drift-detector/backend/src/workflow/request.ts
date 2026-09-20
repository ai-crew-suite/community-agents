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
import type { BlueprintSpec, DriftCheckRequest } from './state';

/** Raised when a drift request cannot be bounded or safely interpreted. */
export class DriftRequestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DriftRequestValidationError';
  }
}

const string = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

const safePath = (value: string) =>
  value.length <= 512 && !value.startsWith('/') && !value.split('/').includes('..');

/** Parses a bounded blueprint expectation from request data without executing template content. */
const blueprint = (value: unknown): BlueprintSpec | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;

  const raw = value as Record<string, unknown>;
  const limits = raw.limits && typeof raw.limits === 'object' && !Array.isArray(raw.limits)
    ? (raw.limits as Record<string, unknown>)
    : undefined;

  return {
    replicas: typeof raw.replicas === 'number' && Number.isFinite(raw.replicas)
      ? raw.replicas
      : undefined,
    image: string(raw.image),
    limits: limits ? { cpu: string(limits.cpu), memory: string(limits.memory) } : undefined,
  };
};

/** Parses the AI Core query payload and bounds every user-controlled field. */
export const parseDriftQuery = (
  query: string,
  source: DriftCheckRequest['source'],
  maxInfraFiles: number
): DriftCheckRequest => {
  let raw: unknown;
  try {
    raw = JSON.parse(query);
  } catch {
    throw new DriftRequestValidationError('Run query must be a JSON DriftCheckRequest payload');
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new DriftRequestValidationError('Request payload must be a JSON object');
  }

  const value = raw as Record<string, unknown>;
  if (value.version !== 1) {
    throw new DriftRequestValidationError(`Unsupported request version: ${String(value.version)}`);
  }

  const entityRef = string(value.entityRef);
  if (!entityRef) {
    throw new DriftRequestValidationError("Request field 'entityRef' must be a non-empty string");
  }

  const paths = Array.isArray(value.infraPaths)
    ? value.infraPaths
        .filter((path): path is string => typeof path === 'string' && safePath(path))
        .slice(0, maxInfraFiles)
    : undefined;

  if (Array.isArray(value.infraPaths) && paths?.length !== value.infraPaths.length) {
    throw new DriftRequestValidationError("Request field 'infraPaths' contains an unsafe path");
  }

  return {
    version: 1,
    source: value.source === 'scheduler' ? 'scheduler' : source,
    entityRef,
    repoUrl: string(value.repoUrl),
    infraPaths: paths,
    remediate: value.remediate === true,
    blueprint: blueprint(value.blueprint)
  };
};
