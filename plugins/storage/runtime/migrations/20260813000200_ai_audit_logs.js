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

exports.up = async function up(knex) {
  await knex.schema.createTable('ai_audit_logs', table => {
    table.uuid('id').primary().notNullable();
    table.uuid('run_id').notNullable().references('id').inTable('ai_runs').onDelete('CASCADE');
    table.string('agent_id').notNullable();
    table.string('action').notNullable();
    table.string('tool_id').nullable();
    table.json('payload').nullable();
    table.string('actor').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.index(['run_id', 'created_at'], 'idx_ai_audit_logs_run_created_at');
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('ai_audit_logs');
};
