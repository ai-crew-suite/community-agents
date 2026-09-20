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
import type { InfraGenerationRequest } from './state';

/** Raised for unsafe or non-compliant IaC generation input. */
export class InfraRequestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InfraRequestValidationError';
  }
}

interface ValidationConfig {
  maxCpu: number;
  maxMemoryMb: number;
  maxStorageGb: number;
  allowedRegions: string[];
}

/** Parses a bounded request and enforces capacity, region, and service naming policy. */
export const parseInfraQuery = (
  query: string,
  source: InfraGenerationRequest['source'],
  config: ValidationConfig
): InfraGenerationRequest => {
  let raw: unknown;
  try {
    raw = JSON.parse(query);
  } catch {
    throw new InfraRequestValidationError('Run query must be a JSON InfraGenerationRequest payload');
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new InfraRequestValidationError('Request payload must be a JSON object');
  }

  const value = raw as Record<string, unknown>;
  if (value.version !== 1) {
    throw new InfraRequestValidationError(`Unsupported request version: ${String(value.version)}`);
  }

  if (value.provider !== 'terraform' && value.provider !== 'cloudformation') {
    throw new InfraRequestValidationError("Request field 'provider' must be terraform or cloudformation");
  }

  if (typeof value.serviceName !== 'string' || !/^[a-z0-9-]+$/.test(value.serviceName)) {
    throw new InfraRequestValidationError("Request field 'serviceName' must use lowercase letters, numbers, and hyphens");
  }

  const capacity = value.capacity && typeof value.capacity === 'object' && !Array.isArray(value.capacity)
    ? (value.capacity as Record<string, unknown>)
    : undefined;

  const parsed = capacity ? {
    cpu: typeof capacity.cpu === 'number' ? capacity.cpu : undefined,
    memoryMb: typeof capacity.memoryMb === 'number' ? capacity.memoryMb : undefined,
    storageGb: typeof capacity.storageGb === 'number' ? capacity.storageGb : undefined,
    instanceType: typeof capacity.instanceType === 'string' ? capacity.instanceType : undefined
  } : undefined;

  if (
    (parsed?.cpu ?? 0) > config.maxCpu ||
    (parsed?.memoryMb ?? 0) > config.maxMemoryMb ||
    (parsed?.storageGb ?? 0) > config.maxStorageGb
  ) {
    throw new InfraRequestValidationError('Requested capacity exceeds configured maxima');
  }

  const region = typeof value.region === 'string' ? value.region : undefined;
  if (region && !config.allowedRegions.includes(region)) {
    throw new InfraRequestValidationError(`Region '${region}' is not allowed`);
  }

  return {
    version: 1,
    source: value.source === 'action' ? 'action' : source,
    provider: value.provider,
    serviceName: value.serviceName,
    entityRef: typeof value.entityRef === 'string' ? value.entityRef : undefined,
    environment: typeof value.environment === 'string' ? value.environment : undefined,
    capacity: parsed,
    region,
    blueprintId: typeof value.blueprintId === 'string' ? value.blueprintId : undefined,
    outputDir: typeof value.outputDir === 'string' ? value.outputDir : undefined
  };
};
