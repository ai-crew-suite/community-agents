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

/** Minimal catalog query surface for bound-resource and group verification. */
export type CatalogBindingClient = {
  getEntities(request?: {
    filter?: Record<string, string | string[]>;
  }): Promise<{
    items: {
      kind?: string;
      metadata?: {
        name?: string;
        namespace?: string;
        annotations?: Record<string, string>;
      };
    }[];
  }>;
};

/** Builds exact registered-resource identifiers and group refs from catalog entities. */
export class CatalogBindingIndex {
  constructor(
    private readonly client: CatalogBindingClient,
    private readonly annotation: string,
  ) {}

  async load(): Promise<{ registeredIds: Set<string>; groups: Set<string> }> {
    const response = await this.client.getEntities({
      filter: { kind: ['Resource', 'Group'] },
    });

    const registeredIds = new Set<string>();
    const groups = new Set<string>();

    response.items.forEach(entity => {
      const annotation = entity.metadata?.annotations?.[this.annotation];

      if (entity.kind === 'Resource' && annotation)
        registeredIds.add(annotation);

      if (entity.kind === 'Group' && entity.metadata?.name)
        groups.add(
          `group:${entity.metadata.namespace ?? 'default'}/${entity.metadata.name}`,
        );
    });

    return { registeredIds, groups };
  }
}
