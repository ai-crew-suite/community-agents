/*
 * Copyright 2024 Larder Software Limited
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

exports.up = async function up(knex) {
  await knex.schema.alterTable('embeddings', table => {
    table.string('source').nullable();
  });

  await knex.schema.raw(
    "UPDATE embeddings SET source = COALESCE(metadata->>'source', 'unknown') WHERE source IS NULL",
  );

  await knex.schema.alterTable('embeddings', table => {
    table.index(['source'], 'idx_embeddings_source');
  });
};

exports.down = async function down(knex) {
  await knex.schema.alterTable('embeddings', table => {
    table.dropIndex(['source'], 'idx_embeddings_source');
    table.dropColumn('source');
  });
};
