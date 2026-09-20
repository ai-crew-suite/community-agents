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
  await knex.schema.createTable('ai_sessions', table => {
    table.uuid('id').primary().notNullable();
    table.string('agent_id').notNullable();
    table.string('user_ref').nullable();
    table.json('metadata').notNullable().defaultTo('{}');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('ai_messages', table => {
    table.uuid('id').primary().notNullable();
    table.uuid('session_id').notNullable().references('id').inTable('ai_sessions').onDelete('CASCADE');
    table.string('role').notNullable();
    table.text('content').notNullable();
    table.json('token_usage').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.index(['session_id', 'created_at'], 'idx_ai_messages_session_created_at');
  });

  await knex.schema.createTable('ai_runs', table => {
    table.uuid('id').primary().notNullable();
    table.string('agent_id').notNullable();
    table.uuid('session_id').nullable().references('id').inTable('ai_sessions').onDelete('SET NULL');
    table.string('status').notNullable();
    table.string('trigger').nullable();
    table.string('idempotency_key').nullable().unique();
    table.timestamp('started_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('ended_at').nullable();
    table.index(['agent_id', 'status'], 'idx_ai_runs_agent_status');
  });

  await knex.schema.createTable('ai_run_steps', table => {
    table.uuid('id').primary().notNullable();
    table.uuid('run_id').notNullable().references('id').inTable('ai_runs').onDelete('CASCADE');
    table.integer('seq').notNullable();
    table.string('type').notNullable();
    table.json('payload').notNullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.index(['run_id', 'seq'], 'idx_ai_run_steps_run_seq');
  });

  await knex.schema.createTable('ai_checkpoints', table => {
    table.uuid('run_id').primary().notNullable();
    table.json('state').notNullable();
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('ai_artifacts', table => {
    table.uuid('id').primary().notNullable();
    table.uuid('run_id').notNullable().references('id').inTable('ai_runs').onDelete('CASCADE');
    table.string('kind').notNullable();
    table.string('ref').nullable();
    table.text('url').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('ai_approvals', table => {
    table.uuid('id').primary().notNullable();
    table.uuid('run_id').notNullable().references('id').inTable('ai_runs').onDelete('CASCADE');
    table.string('status').notNullable();
    table.timestamp('requested_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('decided_at').nullable();
    table.string('decided_by').nullable();
    table.text('note').nullable();
    table.index(['run_id', 'status'], 'idx_ai_approvals_run_status');
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('ai_approvals');
  await knex.schema.dropTableIfExists('ai_artifacts');
  await knex.schema.dropTableIfExists('ai_checkpoints');
  await knex.schema.dropTableIfExists('ai_run_steps');
  await knex.schema.dropTableIfExists('ai_runs');
  await knex.schema.dropTableIfExists('ai_messages');
  await knex.schema.dropTableIfExists('ai_sessions');
};
