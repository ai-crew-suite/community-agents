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
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ApprovalDecision,
  ApprovalRequest,
  Artifact,
  AuditLogEntry,
  RunRecord,
} from '@ai-crew-suite/plugin-kernel-node';
import { SqlAgentRuntimeStore } from '../SqlAgentRuntimeStore';

type QueryDouble = {
  insert: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  andWhere: ReturnType<typeof vi.fn>;
  orderBy: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  first: ReturnType<typeof vi.fn>;
  onConflict: ReturnType<typeof vi.fn>;
  merge: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};

type ClientDouble = {
  (tableName: string): QueryDouble;
  fn: { now: ReturnType<typeof vi.fn> };
};

const createQuery = () => {
  const query = {} as QueryDouble;
  query.insert = vi.fn(() => query);
  query.select = vi.fn(() => query);
  query.where = vi.fn(() => query);
  query.andWhere = vi.fn(() => query);
  query.orderBy = vi.fn(() => query);
  query.limit = vi.fn(async () => []);
  query.first = vi.fn(async () => undefined);
  query.onConflict = vi.fn(() => query);
  query.merge = vi.fn(async () => query);
  query.update = vi.fn(async () => undefined);
  return query;
};

const createClient = () => {
  const queries: QueryDouble[] = [];
  const queuedQueries: QueryDouble[] = [];
  const client = vi.fn((_tableName: string) => {
    const query = queuedQueries.shift() ?? createQuery();
    queries.push(query);
    return query;
  }) as unknown as ClientDouble;
  client.fn = { now: vi.fn(() => 'now()') };
  const queueQuery = (query = createQuery()) => {
    queuedQueries.push(query);
    return query;
  };

  return { client, queries, queueQuery };
};

const firstInsert = (query: QueryDouble) => query.insert.mock.calls[0][0];

const runRow = {
  id: 'run-a',
  agent_id: 'agent-a',
  session_id: 'session-a',
  status: 'running',
  trigger: 'manual',
  idempotency_key: 'idem-a',
};

const runRecord: RunRecord = {
  id: 'run-a',
  agentId: 'agent-a',
  sessionId: 'session-a',
  status: 'running',
  trigger: 'manual',
  idempotencyKey: 'idem-a',
};

describe('SqlAgentRuntimeStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates sessions and appends messages with serialized token usage', async () => {
    const { client, queries } = createClient();
    const store = new SqlAgentRuntimeStore(client as unknown as Knex);

    const sessionId = await store.createSession('agent-a', 'user:default/alice');
    await store.appendMessage('session-a', {
      role: 'assistant',
      content: 'hello',
      tokenUsage: { input: 1, output: 2, total: 3 },
    });

    expect(sessionId).toEqual(expect.any(String));
    expect(client).toHaveBeenNthCalledWith(1, 'ai_sessions');
    expect(firstInsert(queries[0])).toEqual({
      id: sessionId,
      agent_id: 'agent-a',
      user_ref: 'user:default/alice',
      metadata: '{}',
    });
    expect(client).toHaveBeenNthCalledWith(2, 'ai_messages');
    expect(firstInsert(queries[1])).toEqual({
      id: expect.any(String),
      session_id: 'session-a',
      role: 'assistant',
      content: 'hello',
      token_usage: JSON.stringify({ input: 1, output: 2, total: 3 }),
    });
  });

  it('lists the most recent session messages in chronological order', async () => {
    const { client, queueQuery } = createClient();
    const messagesQuery = queueQuery();
    const store = new SqlAgentRuntimeStore(client as unknown as Knex);
    messagesQuery.limit.mockResolvedValueOnce([
      {
        role: 'assistant',
        content: 'newer answer',
        token_usage: { input: 3, output: 5, total: 8 },
        created_at: '2026-07-19T12:00:00.000Z',
      },
      {
        role: 'user',
        content: 'older question',
        token_usage: '{"input":1,"output":2,"total":3}',
        created_at: '2026-07-19T11:59:00.000Z',
      },
    ]);

    await expect(store.listMessages('session-a', 2)).resolves.toEqual([
      {
        role: 'user',
        content: 'older question',
        tokenUsage: { input: 1, output: 2, total: 3 },
        createdAt: '2026-07-19T11:59:00.000Z',
      },
      {
        role: 'assistant',
        content: 'newer answer',
        tokenUsage: { input: 3, output: 5, total: 8 },
        createdAt: '2026-07-19T12:00:00.000Z',
      },
    ]);

    expect(client).toHaveBeenLastCalledWith('ai_messages');
    expect(messagesQuery.select).toHaveBeenCalledWith('role', 'content', 'token_usage', 'created_at');
    expect(messagesQuery.where).toHaveBeenCalledWith({ session_id: 'session-a' });
    expect(messagesQuery.orderBy).toHaveBeenCalledWith('created_at', 'desc');
    expect(messagesQuery.limit).toHaveBeenCalledWith(2);
  });

  it('upserts and loads checkpoints using jsonb-compatible payloads', async () => {
    const { client, queries, queueQuery } = createClient();
    const store = new SqlAgentRuntimeStore(client as unknown as Knex);
    const state = { status: 'awaiting_approval', nested: { count: 1 } };

    await store.save('run-a', state);

    expect(client).toHaveBeenCalledWith('ai_checkpoints');
    expect(firstInsert(queries[0])).toEqual({
      run_id: 'run-a',
      state: JSON.stringify(state),
    });
    expect(queries[0].onConflict).toHaveBeenCalledWith('run_id');
    expect(queries[0].merge).toHaveBeenCalledWith({
      state: JSON.stringify(state),
      updated_at: 'now()',
    });

    const objectLoadQuery = queueQuery();
    objectLoadQuery.first.mockResolvedValueOnce({ state });
    await expect(store.load('run-a')).resolves.toEqual(state);
    expect(objectLoadQuery.select).toHaveBeenCalledWith('state');
    expect(objectLoadQuery.where).toHaveBeenCalledWith({ run_id: 'run-a' });

    const stringLoadQuery = queueQuery();
    stringLoadQuery.first.mockResolvedValueOnce({ state: JSON.stringify(state) });
    await expect(store.load('run-a')).resolves.toEqual(state);

    const missingLoadQuery = queueQuery();
    missingLoadQuery.first.mockResolvedValueOnce(undefined);
    await expect(store.load('missing-run')).resolves.toBeUndefined();
  });

  it('creates and maps run records, including idempotency lookups', async () => {
    const { client, queries, queueQuery } = createClient();
    const store = new SqlAgentRuntimeStore(client as unknown as Knex);

    await store.createRun(runRecord);
    expect(client).toHaveBeenCalledWith('ai_runs');
    expect(firstInsert(queries[0])).toEqual({
      id: 'run-a',
      agent_id: 'agent-a',
      session_id: 'session-a',
      status: 'running',
      trigger: 'manual',
      idempotency_key: 'idem-a',
    });

    const getRunQuery = queueQuery();
    getRunQuery.first.mockResolvedValueOnce(runRow);
    await expect(store.getRun('run-a')).resolves.toEqual(runRecord);
    expect(getRunQuery.where).toHaveBeenCalledWith({ id: 'run-a' });

    const idempotencyQuery = queueQuery();
    idempotencyQuery.first.mockResolvedValueOnce(runRow);
    await expect(store.findRunByIdempotencyKey('idem-a')).resolves.toEqual(runRecord);
    expect(idempotencyQuery.where).toHaveBeenCalledWith({ idempotency_key: 'idem-a' });

    const missingRunQuery = queueQuery();
    missingRunQuery.first.mockResolvedValueOnce(undefined);
    await expect(store.getRun('missing-run')).resolves.toBeUndefined();
  });

  it('updates run status and only clears ended_at for running runs', async () => {
    const { client, queries } = createClient();
    const store = new SqlAgentRuntimeStore(client as unknown as Knex);

    await store.updateRunStatus('run-a', 'running');
    await store.updateRunStatus('run-a', 'done');

    expect(client).toHaveBeenNthCalledWith(1, 'ai_runs');
    expect(queries[0].where).toHaveBeenCalledWith({ id: 'run-a' });
    expect(queries[0].update).toHaveBeenCalledWith({ status: 'running', ended_at: null });
    expect(client).toHaveBeenNthCalledWith(2, 'ai_runs');
    expect(queries[1].update).toHaveBeenCalledWith({ status: 'done', ended_at: 'now()' });
  });

  it('appends and lists replayable run steps after a sequence checkpoint', async () => {
    const { client, queries, queueQuery } = createClient();
    const store = new SqlAgentRuntimeStore(client as unknown as Knex);
    const payload = { runId: 'run-a', text: 'hello' };

    await store.appendRunStep('run-a', 7, 'token', payload);
    expect(client).toHaveBeenCalledWith('ai_run_steps');
    expect(firstInsert(queries[0])).toEqual({
      id: expect.any(String),
      run_id: 'run-a',
      seq: 7,
      type: 'token',
      payload: JSON.stringify(payload),
    });

    const listStepsQuery = queueQuery();
    listStepsQuery.orderBy.mockResolvedValueOnce([
      { seq: 8, type: 'done', payload: { runId: 'run-a' } },
      { seq: 9, type: 'usage', payload: '{"total":3}' },
    ]);

    await expect(store.listRunSteps('run-a', 7)).resolves.toEqual([
      { seq: 8, type: 'done', payload: { runId: 'run-a' } },
      { seq: 9, type: 'usage', payload: { total: 3 } },
    ]);
    expect(listStepsQuery.select).toHaveBeenCalledWith('seq', 'type', 'payload');
    expect(listStepsQuery.where).toHaveBeenCalledWith({ run_id: 'run-a' });
    expect(listStepsQuery.andWhere).toHaveBeenCalledWith('seq', '>', 7);
    expect(listStepsQuery.orderBy).toHaveBeenCalledWith('seq', 'asc');
  });

  it('persists and resolves approval requests and decisions', async () => {
    const { client, queries, queueQuery } = createClient();
    const store = new SqlAgentRuntimeStore(client as unknown as Knex);
    const request: ApprovalRequest = {
      id: 'approval-a',
      runId: 'run-a',
      reason: 'Needs write access',
      effect: 'write',
    };
    const decision: ApprovalDecision = {
      status: 'approved',
      note: 'Ship it',
      decidedBy: 'user:default/reviewer',
    };

    await store.createApproval(request);
    expect(client).toHaveBeenCalledWith('ai_approvals');
    expect(firstInsert(queries[0])).toEqual({
      id: 'approval-a',
      run_id: 'run-a',
      status: 'pending',
      note: 'Needs write access',
    });

    const pendingApprovalQuery = queueQuery();
    pendingApprovalQuery.first.mockResolvedValueOnce({
      id: 'approval-a',
      run_id: 'run-a',
      status: 'pending',
      note: null,
    });
    await expect(store.getPendingApproval('run-a')).resolves.toEqual({
      id: 'approval-a',
      runId: 'run-a',
      reason: 'Approval required',
      effect: 'write',
    });
    expect(pendingApprovalQuery.where).toHaveBeenCalledWith({ run_id: 'run-a', status: 'pending' });
    expect(pendingApprovalQuery.orderBy).toHaveBeenCalledWith('requested_at', 'desc');

    await store.decideApproval('run-a', decision);
    expect(queries[2].where).toHaveBeenCalledWith({ run_id: 'run-a', status: 'pending' });
    expect(queries[2].update).toHaveBeenCalledWith({
      status: 'approved',
      note: 'Ship it',
      decided_at: 'now()',
      decided_by: 'user:default/reviewer',
    });
  });

  it('records artifacts and audit log entries with nullable optional fields', async () => {
    const { client, queries } = createClient();
    const store = new SqlAgentRuntimeStore(client as unknown as Knex);
    const artifact: Artifact = {
      id: 'artifact-a',
      runId: 'run-a',
      kind: 'doc',
    };
    const auditEntry: AuditLogEntry = {
      id: 'audit-a',
      runId: 'run-a',
      agentId: 'agent-a',
      action: 'write_tool_call',
      payload: { secret: '[REDACTED]' },
    };

    await store.record(artifact);
    expect(client).toHaveBeenCalledWith('ai_artifacts');
    expect(firstInsert(queries[0])).toEqual({
      id: 'artifact-a',
      run_id: 'run-a',
      kind: 'doc',
      ref: null,
      url: null,
    });

    await store.recordWriteAction(auditEntry);
    expect(client).toHaveBeenCalledWith('ai_audit_logs');
    expect(firstInsert(queries[1])).toEqual({
      id: 'audit-a',
      run_id: 'run-a',
      agent_id: 'agent-a',
      action: 'write_tool_call',
      tool_id: null,
      payload: JSON.stringify({ secret: '[REDACTED]' }),
      actor: null,
    });
  });
});
