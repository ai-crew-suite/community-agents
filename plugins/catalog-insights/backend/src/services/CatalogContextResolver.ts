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
  CatalogEntityLike,
  CatalogEntityResolver,
  CatalogEntitySummary,
  CatalogIntegrationReferences,
  CatalogRelationGraph,
} from '@ai-crew-suite/plugin-kernel-node';
import {
  extractIntegrationReferences,
  toCatalogEntityRelations,
  toCatalogEntitySummary,
} from '@ai-crew-suite/plugin-kernel-node';

/**
 * Minimal catalog HTTP client surface consumed by the resolver. Structurally
 * compatible with `CatalogClient` from `@backstage/catalog-client`; keeping
 * the surface narrow makes the adapter unit-testable with plain fakes.
 */
export type CatalogClientLike = {
  getEntityByRef(
    entityRef: string,
    requestOptions?: { token?: string },
  ): Promise<CatalogEntityLike | undefined>;
  getEntities(
    request?: {
      filter?: Record<string, string | string[]> | Record<string, string | string[]>[];
      fields?: string[];
      limit?: number;
    },
    requestOptions?: { token?: string },
  ): Promise<{ items: CatalogEntityLike[] }>;
};

/**
 * Supplies the plugin-to-plugin token used for catalog requests. In
 * production this is backed by `auth.getPluginRequestToken`; tests inject a
 * stub. Returning `undefined` performs an unauthenticated catalog read.
 */
export type CatalogTokenProvider = () => Promise<string | undefined>;

export type CatalogContextResolverOptions = {
  client: CatalogClientLike;
  getToken: CatalogTokenProvider;
};

/**
 * `catalogServiceRef`-style adapter implementing the shared
 * `CatalogEntityResolver` contract on top of the real Backstage catalog HTTP
 * client. All queries are bounded: relation traversal respects `maxDepth` and
 * `limit`, and annotation lookups are capped by the caller-supplied `limit`.
 */
export class CatalogContextResolver implements CatalogEntityResolver {
  constructor(private readonly options: CatalogContextResolverOptions) {}

  async getEntitySummary(
    entityRef: string,
  ): Promise<CatalogEntitySummary | undefined> {
    const entity = await this.options.client.getEntityByRef(entityRef, {
      token: await this.options.getToken(),
    });
    return entity ? toCatalogEntitySummary(entity) : undefined;
  }

  async findByAnnotation(input: {
    annotation: string;
    value: string;
    kinds?: string[];
    limit?: number;
  }): Promise<CatalogEntitySummary[]> {
    const filter: Record<string, string | string[]> = {
      [`metadata.annotations.${input.annotation}`]: input.value,
    };
    if (input.kinds && input.kinds.length > 0) {
      filter.kind = input.kinds;
    }
    const response = await this.options.client.getEntities(
      { filter },
      { token: await this.options.getToken() },
    );
    return response.items
      .slice(0, input.limit ?? 25)
      .map(toCatalogEntitySummary);
  }

  async getRelations(input: {
    entityRef: string;
    relationTypes: string[];
    maxDepth: number;
    limit: number;
  }): Promise<CatalogRelationGraph> {
    const token = await this.options.getToken();
    const wanted = new Set(input.relationTypes);
    const entities: Record<string, CatalogEntitySummary> = {};
    const relations: CatalogRelationGraph['relations'] = [];
    let truncated = false;

    // Breadth-first traversal with an explicit hop and entity budget so a
    // dense catalog graph can never fan out unboundedly.
    let frontier = [input.entityRef];
    for (let depth = 0; depth < input.maxDepth && frontier.length > 0; depth += 1) {
      const next: string[] = [];
      for (const ref of frontier) {
        if (Object.keys(entities).length >= input.limit) {
          truncated = true;
          break;
        }
        const entity = await this.options.client.getEntityByRef(ref, { token });
        if (!entity) {
          continue;
        }
        const summary = toCatalogEntitySummary(entity);
        entities[summary.ref] = summary;
        for (const relation of toCatalogEntityRelations(entity)) {
          if (!wanted.has(relation.type)) {
            continue;
          }
          relations.push(relation);
          if (!(relation.targetRef in entities) && !next.includes(relation.targetRef)) {
            next.push(relation.targetRef);
          }
        }
      }
      frontier = next;
      if (truncated) {
        break;
      }
    }
    if (frontier.length > 0 && input.maxDepth > 0) {
      truncated = true;
    }

    return { rootRef: input.entityRef, entities, relations, truncated };
  }

  async getIntegrationReferences(
    entityRef: string,
  ): Promise<CatalogIntegrationReferences> {
    const entity = await this.options.client.getEntityByRef(entityRef, {
      token: await this.options.getToken(),
    });
    return extractIntegrationReferences(entity ?? {});
  }
}
