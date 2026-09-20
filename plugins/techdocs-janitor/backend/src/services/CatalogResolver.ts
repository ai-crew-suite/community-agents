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
  CatalogEntityResolver,
  CatalogEntitySummary,
} from '@ai-crew-suite/plugin-kernel-node';

/** Minimal catalog resolver for owner truth used by the scoped read-only janitor. */
export class CatalogResolver implements Pick<
  CatalogEntityResolver,
  'getEntitySummary'
> {
  constructor(
    private readonly getEntity: (
      entityRef: string,
    ) => Promise<CatalogEntitySummary | undefined>,
  ) {}

  /** Returns the compact catalog summary for one readable entity. */
  async getEntitySummary(
    entityRef: string,
  ): Promise<CatalogEntitySummary | undefined> {
    return this.getEntity(entityRef);
  }
}
