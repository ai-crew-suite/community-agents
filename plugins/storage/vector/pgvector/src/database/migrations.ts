/*
 * Copyright 2024 Larder Software Limited
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

import { existsSync } from 'fs';
import { resolve as resolvePath } from 'path';
import { Knex } from 'knex';

/**
 * Locates the packaged migrations directory relative to this file.
 *
 * `resolvePackagePath` from `@backstage/backend-plugin-api` cannot resolve
 * workspace packages under Yarn PnP (the resolution issuer is the API package
 * itself), so the directory is found by probing the two layouts this module
 * runs from: bundled (`dist/index.cjs.js`) and source (`src/database`).
 */
const findMigrationsDir = (): string => {
  const candidates = [
    resolvePath(__dirname, '..', 'migrations'),
    resolvePath(__dirname, '..', '..', 'migrations'),
  ];
  const match = candidates.find(dir => existsSync(dir));
  if (!match) {
    throw new Error(
      `Could not locate the pgvector migrations directory from ${__dirname}`,
    );
  }
  return match;
};

/**
 * Applies the packaged pgvector module database migrations to the provided
 * Backstage database client.
 */
export async function applyDatabaseMigrations(knex: Knex): Promise<void> {
  await knex.migrate.latest({
    directory: findMigrationsDir(),
  });
}
