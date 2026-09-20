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
import type { Knex } from 'knex';
import { describe, expect, it, vi } from 'vitest';
import { applyDatabaseMigrations } from '../migrations';

describe('applyDatabaseMigrations', () => {
  it('applies the packaged pgvector migrations with Knex', async () => {
    const latest = vi.fn(async () => undefined);
    const knex = {
      migrate: { latest },
    } as unknown as Knex;

    await applyDatabaseMigrations(knex);

    expect(latest).toHaveBeenCalledWith(
      expect.objectContaining({
        directory: expect.stringMatching(/plugin-ai-core-backend-module-storage-pgvector\/migrations$/),
      }),
    );
  });
});