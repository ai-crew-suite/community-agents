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

/** Minimal catalog client surface retained locally to avoid private sibling imports. */
export type CatalogClientLike = {
  getEntityByRef(
    ref: string,
    options?: { token?: string },
  ): Promise<CatalogEntityLike | undefined>;
  getEntities(
    request?: { filter?: Record<string, string | string[]> },
    options?: { token?: string },
  ): Promise<{ items: CatalogEntityLike[] }>;
};

/** Catalog resolver adapter options. */
export type CatalogResolverOptions = {
  client: CatalogClientLike;
  getToken: () => Promise<string | undefined>;
};

/** Bounded catalog adapter used by the impact workflow. */
export class CatalogResolver implements CatalogEntityResolver {
  constructor(private readonly options: CatalogResolverOptions) {}

  async getEntitySummary(
    ref: string,
  ): Promise<CatalogEntitySummary | undefined> {
    const entity = await this.options.client.getEntityByRef(ref, {
      token: await this.options.getToken(),
    });

    return entity ? toCatalogEntitySummary(entity) : undefined;
  }

  async findByAnnotation(): Promise<CatalogEntitySummary[]> {
    return [];
  }

  async getIntegrationReferences(
    ref: string,
  ): Promise<CatalogIntegrationReferences> {
    const entity = await this.options.client.getEntityByRef(ref, {
      token: await this.options.getToken(),
    });

    return extractIntegrationReferences(entity ?? {});
  }

  async getRelations(input: {
    entityRef: string;
    relationTypes: string[];
    maxDepth: number;
    limit: number;
  }): Promise<CatalogRelationGraph> {
    const token = await this.options.getToken();
    const entities: Record<string, CatalogEntitySummary> = {};
    const relations: CatalogRelationGraph['relations'] = [];
    const wanted = new Set(input.relationTypes);

    let frontier = [input.entityRef];
    let truncated = false;

    for (let depth = 0; depth < input.maxDepth && frontier.length; depth += 1) {
      const next: string[] = [];

      for (const ref of frontier) {
        if (Object.keys(entities).length >= input.limit) {
          truncated = true;
          break;
        }

        const entity = await this.options.client.getEntityByRef(ref, { token });

        if (!entity) continue;

        const summary = toCatalogEntitySummary(entity);

        entities[summary.ref] = summary;

        for (const edge of toCatalogEntityRelations(entity))
          if (wanted.has(edge.type)) {
            relations.push(edge);
            if (!entities[edge.targetRef] && !next.includes(edge.targetRef))
              next.push(edge.targetRef);
          }
      }
      frontier = next;

      if (truncated) break;
    }

    return {
      rootRef: input.entityRef,
      entities,
      relations,
      truncated: truncated || frontier.length > 0,
    };
  }
}
