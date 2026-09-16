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
import type {
  CatalogEntityRelation,
  CatalogEntitySummary,
  CatalogIntegrationReferences,
} from '../../types/catalog';

/**
 * Minimal structural view of a raw catalog entity that the pure mapping
 * functions operate on. Structural (rather than importing
 * `@backstage/catalog-model`) so this package stays dependency-light and the
 * mapping is testable with plain fixtures.
 */
export type CatalogEntityLike = {
  apiVersion?: string;
  kind?: string;
  metadata?: {
    namespace?: string;
    name?: string;
    title?: string;
    description?: string;
    annotations?: Record<string, string>;
    tags?: string[];
  };
  spec?: {
    type?: string;
    lifecycle?: string;
    owner?: string;
    system?: string;
  } & Record<string, unknown>;
  relations?: { type?: string; targetRef?: string }[];
};

const DEFAULT_NAMESPACE = 'default';

const readString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

const normalizeAnnotations = (
  value: unknown,
): Record<string, string> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }
  const annotations: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === 'string') {
      annotations[key] = raw;
    }
  }
  return annotations;
};

/**
 * Maps a raw catalog entity into the compact {@link CatalogEntitySummary}
 * shape used by agent workflows. Missing metadata fields are tolerated; the
 * kind/name default to `unknown` so a malformed entity never throws here.
 */
export const toCatalogEntitySummary = (
  entity: CatalogEntityLike,
): CatalogEntitySummary => {
  const kind = readString(entity.kind) ?? 'unknown';
  const namespace = readString(entity.metadata?.namespace) ?? DEFAULT_NAMESPACE;
  const name = readString(entity.metadata?.name) ?? 'unknown';
  const spec = entity.spec ?? {};

  return {
    ref: `${kind.toLowerCase()}:${namespace}/${name}`,
    kind,
    namespace,
    name,
    title: readString(entity.metadata?.title),
    description: readString(entity.metadata?.description),
    type: readString(spec.type),
    lifecycle: readString(spec.lifecycle),
    owner: readString(spec.owner),
    system: readString(spec.system),
    annotations: normalizeAnnotations(entity.metadata?.annotations),
    tags: Array.isArray(entity.metadata?.tags)
      ? entity.metadata.tags.filter(
          (tag): tag is string => typeof tag === 'string',
        )
      : [],
  };
};

/**
 * Maps raw entity relation records into typed, well-formed relation edges.
 * Malformed entries (missing type or target) are dropped.
 */
export const toCatalogEntityRelations = (
  entity: CatalogEntityLike,
): CatalogEntityRelation[] => {
  if (!Array.isArray(entity.relations)) {
    return [];
  }
  const relations: CatalogEntityRelation[] = [];
  for (const relation of entity.relations) {
    const type = readString(relation?.type);
    const targetRef = readString(relation?.targetRef);
    if (type && targetRef) {
      relations.push({ type, targetRef });
    }
  }
  return relations;
};

/**
 * Extracts integration handles from well-known Backstage annotations:
 * Kubernetes (`backstage.io/kubernetes-id`), on-call providers
 * (`pagerduty.com/*`), monitoring providers, source location, and TechDocs.
 * Annotations with unknown key formats are ignored rather than mis-parsed.
 */
export const extractIntegrationReferences = (
  entity: CatalogEntityLike,
): CatalogIntegrationReferences => {
  const annotations = normalizeAnnotations(entity.metadata?.annotations);

  const kubernetesIds = annotations['backstage.io/kubernetes-id']
    ? [annotations['backstage.io/kubernetes-id']]
    : [];

  const repositories: string[] = [];
  const oncall: string[] = [];
  const monitoring: string[] = [];

  for (const [key, value] of Object.entries(annotations)) {
    if (key === 'backstage.io/source-location') {
      // handled below as its own field
      continue;
    }
    if (
      key.startsWith('github.com/') ||
      key.startsWith('gitlab.com/') ||
      key.startsWith('bitbucket.org/') ||
      key.startsWith('dev.azure.com/')
    ) {
      repositories.push(value);
    } else if (key.startsWith('pagerduty.com/')) {
      oncall.push(value);
    } else if (
      key.startsWith('opsgenie.com/') ||
      key.startsWith('datadoghq.com/') ||
      key.startsWith('newrelic.com/') ||
      key.startsWith('splunk.com/')
    ) {
      monitoring.push(value);
    }
  }

  return {
    kubernetesIds,
    repositories,
    oncall,
    monitoring,
    techdocsRef: annotations['backstage.io/techdocs-ref'],
    sourceLocation: annotations['backstage.io/source-location'],
  };
};
