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
import type { ImpactRequest } from './state';

/** Raised when an impact request is unscoped, malformed, or too broad. */
export class ImpactRequestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImpactRequestValidationError';
  }
}

const kinds = new Set<ImpactRequest['change']['kind']>([
  'endpoint_removed',
  'endpoint_deprecated',
  'field_renamed',
  'field_removed',
  'signature_changed',
]);

const relations = new Set([
  'dependsOn',
  'dependencyOf',
  'providesApi',
  'apiConsumedBy',
]);

/** Parses a versioned request while enforcing the installed crawl depth limit. */
export const parseImpactQuery = (
  query: string,
  maxDepth: number,
): ImpactRequest => {
  let raw: unknown;
  try {
    raw = JSON.parse(query);
  } catch {
    throw new ImpactRequestValidationError(
      'Run query must be a JSON ImpactRequest payload',
    );
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw new ImpactRequestValidationError(
      'Request payload must be a JSON object',
    );
    
  const value = raw as Record<string, unknown>;
  const change = value.change as Record<string, unknown> | undefined;

  if (value.version !== 1 || value.source !== 'manual')
    throw new ImpactRequestValidationError(
      'Request requires version 1 and source manual',
    );

  if (typeof value.entityRef !== 'string' || !value.entityRef.trim())
    throw new ImpactRequestValidationError(
      "Request field 'entityRef' is required",
    );

  if (
    !change ||
    !kinds.has(change.kind as ImpactRequest['change']['kind']) ||
    typeof change.symbol !== 'string' ||
    !change.symbol.trim() ||
    change.symbol.length > 500
  )
    throw new ImpactRequestValidationError(
      "Request field 'change' requires a supported kind and a symbol up to 500 characters",
    );

  const requestedTypes = Array.isArray(value.relationTypes)
    ? value.relationTypes
    : undefined;

  if (
    requestedTypes?.some(
      type => typeof type !== 'string' || !relations.has(type),
    )
  )
    throw new ImpactRequestValidationError(
      'Request relationTypes contains an unsupported relation',
    );

  return {
    version: 1,
    source: 'manual',
    entityRef: value.entityRef.trim(),
    change: {
      kind: change.kind as ImpactRequest['change']['kind'],
      symbol: change.symbol.trim(),
      replacement:
        typeof change.replacement === 'string' ? change.replacement : undefined,
      aliases: Array.isArray(change.aliases)
        ? change.aliases
            .filter(
              (alias): alias is string =>
                typeof alias === 'string' && alias.trim().length > 0,
            )
            .slice(0, 10)
        : undefined,
    },
    maxDepth:
      typeof value.maxDepth === 'number'
        ? Math.max(1, Math.min(maxDepth, Math.floor(value.maxDepth)))
        : undefined,
    relationTypes: requestedTypes as string[] | undefined,
  };
};
