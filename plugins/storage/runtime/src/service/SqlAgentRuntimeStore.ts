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
import { randomUUID } from 'crypto';
import { Knex } from 'knex';
import {
  AuditLogEntry,
  AuditLogSink,
  ApprovalDecision,
  ApprovalRequest,
  Artifact,
  ArtifactSink,
  CheckpointStore,
  RunRecord,
  RunStore,
  SessionMessage,
  SessionStore,
} from '@ai-crew-suite/plugin-kernel-node';

/**
 * Normalizes JSON values returned by different PostgreSQL drivers.
 *
 * Knex may return `jsonb` columns as parsed objects or as serialized strings
 * depending on the driver and test double. This helper keeps store methods
 * tolerant of both shapes while preserving the public runtime-store contracts.
 */
const parseStoredJson = <T>(value: unknown): T => {
  if (typeof value === 'string') {
    return JSON.parse(value) as T;
  }

  return value as T;
};

/**
 * SQL-backed implementation of the agent runtime persistence contracts.
 *
 * The store persists conversation sessions, resumable checkpoints, run records,
 * replayable run steps, approval decisions, artifacts, and audit entries using
 * the tables created by the runtime store module migrations. It uses only
 * portable Knex query-builder calls, so it works with any database supplied by
 * the Backstage core database service (PostgreSQL, MySQL, or SQLite).
 */
export class SqlAgentRuntimeStore
  implements SessionStore, CheckpointStore, RunStore, ArtifactSink, AuditLogSink
{
  /**
   * Creates a runtime store that uses the supplied Knex client for all queries.
   */
  constructor(private readonly client: Knex) {}

  /**
   * Creates a persisted conversation session for an agent and optional user.
   *
   * @returns The generated session ID.
   */
  async createSession(agentId: string, userRef?: string): Promise<string> {
    const id = randomUUID();
    await this.client('ai_sessions').insert({
      id,
      agent_id: agentId,
      user_ref: userRef ?? null,
      metadata: JSON.stringify({}),
    });
    return id;
  }

  /**
   * Appends a message to an existing session, including optional token usage.
   */
  async appendMessage(sessionId: string, message: SessionMessage): Promise<void> {
    await this.client('ai_messages').insert({
      id: randomUUID(),
      session_id: sessionId,
      role: message.role,
      content: message.content,
      token_usage: message.tokenUsage ? JSON.stringify(message.tokenUsage) : null,
    });
  }

  /**
   * Lists the most recent messages for a session in chronological order.
   *
   * The query reads newest rows first so the limit selects the latest window,
   * then reverses that window so prompt construction sees normal conversation
   * order from oldest to newest.
   */
  async listMessages(sessionId: string, limit = 20): Promise<SessionMessage[]> {
    const rows = await this.client('ai_messages')
      .select('role', 'content', 'token_usage', 'created_at')
      .where({ session_id: sessionId })
      .orderBy('created_at', 'desc')
      .limit(limit);

    return [...rows].reverse().map(row => ({
      role: row.role,
      content: row.content,
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : undefined,
      tokenUsage: row.token_usage
        ? parseStoredJson<SessionMessage['tokenUsage']>(row.token_usage)
        : undefined,
    }));
  }

  /**
   * Saves or replaces resumable orchestration state for a run.
   */
  async save(runId: string, state: unknown): Promise<void> {
    await this.client('ai_checkpoints')
      .insert({
        run_id: runId,
        state: JSON.stringify(state),
      })
      .onConflict('run_id')
      .merge({
        state: JSON.stringify(state),
        updated_at: this.client.fn.now(),
      });
  }

  /**
   * Loads resumable orchestration state for a run when a checkpoint exists.
   */
  async load<T = unknown>(runId: string): Promise<T | undefined> {
    const row = await this.client('ai_checkpoints')
      .select('state')
      .where({ run_id: runId })
      .first();

    if (!row) {
      return undefined;
    }

    return parseStoredJson<T>(row.state);
  }

  /**
   * Persists the initial lifecycle record for a run.
   */
  async createRun(record: RunRecord): Promise<void> {
    await this.client('ai_runs').insert({
      id: record.id,
      agent_id: record.agentId,
      session_id: record.sessionId ?? null,
      status: record.status,
      trigger: record.trigger ?? null,
      idempotency_key: record.idempotencyKey ?? null,
    });
  }

  /**
   * Looks up a run by ID.
   */
  async getRun(runId: string): Promise<RunRecord | undefined> {
    const row = await this.client('ai_runs')
      .select('id', 'agent_id', 'session_id', 'status', 'trigger', 'idempotency_key')
      .where({ id: runId })
      .first();

    if (!row) {
      return undefined;
    }

    return {
      id: row.id,
      agentId: row.agent_id,
      sessionId: row.session_id ?? undefined,
      status: row.status,
      trigger: row.trigger ?? undefined,
      idempotencyKey: row.idempotency_key ?? undefined,
    };
  }

  /**
   * Looks up a run by its idempotency key for duplicate request handling.
   */
  async findRunByIdempotencyKey(key: string): Promise<RunRecord | undefined> {
    const row = await this.client('ai_runs')
      .select('id', 'agent_id', 'session_id', 'status', 'trigger', 'idempotency_key')
      .where({ idempotency_key: key })
      .first();

    if (!row) {
      return undefined;
    }

    return {
      id: row.id,
      agentId: row.agent_id,
      sessionId: row.session_id ?? undefined,
      status: row.status,
      trigger: row.trigger ?? undefined,
      idempotencyKey: row.idempotency_key ?? undefined,
    };
  }

  /**
   * Updates run lifecycle status and records an end timestamp for terminal states.
   */
  async updateRunStatus(runId: string, status: RunRecord['status']): Promise<void> {
    await this.client('ai_runs')
      .where({ id: runId })
      .update({
        status,
        ended_at: status === 'running' ? null : this.client.fn.now(),
      });
  }

  /**
   * Appends a replayable event payload to a run's event log.
   */
  async appendRunStep(
    runId: string,
    seq: number,
    type: string,
    payload: unknown,
  ): Promise<void> {
    await this.client('ai_run_steps').insert({
      id: randomUUID(),
      run_id: runId,
      seq,
      type,
      payload: JSON.stringify(payload),
    });
  }

  /**
   * Lists persisted run events after the supplied sequence checkpoint.
   */
  async listRunSteps(runId: string, sinceSeq = 0) {
    const rows = await this.client('ai_run_steps')
      .select('seq', 'type', 'payload')
      .where({ run_id: runId })
      .andWhere('seq', '>', sinceSeq)
      .orderBy('seq', 'asc');

    return rows.map(row => ({
      seq: row.seq,
      type: row.type,
      payload: parseStoredJson(row.payload),
    }));
  }

  /**
   * Persists a pending human approval request for a run.
   */
  async createApproval(request: ApprovalRequest): Promise<void> {
    await this.client('ai_approvals').insert({
      id: request.id,
      run_id: request.runId,
      status: 'pending',
      note: request.reason,
    });
  }

  /**
   * Returns the newest pending approval request for a run, if one exists.
   */
  async getPendingApproval(runId: string): Promise<ApprovalRequest | undefined> {
    const row = await this.client('ai_approvals')
      .select('id', 'run_id', 'status', 'note')
      .where({ run_id: runId, status: 'pending' })
      .orderBy('requested_at', 'desc')
      .first();

    if (!row) {
      return undefined;
    }

    return {
      id: row.id,
      runId: row.run_id,
      reason: row.note ?? 'Approval required',
      effect: 'write',
    };
  }

  /**
   * Records a human approval decision for the current pending request on a run.
   */
  async decideApproval(runId: string, decision: ApprovalDecision): Promise<void> {
    await this.client('ai_approvals')
      .where({ run_id: runId, status: 'pending' })
      .update({
        status: decision.status,
        note: decision.note ?? null,
        decided_at: this.client.fn.now(),
        decided_by: decision.decidedBy ?? null,
      });
  }

  /**
   * Persists an artifact produced by an agent run.
   */
  async record(artifact: Artifact): Promise<void> {
    await this.client('ai_artifacts').insert({
      id: artifact.id,
      run_id: artifact.runId,
      kind: artifact.kind,
      ref: artifact.ref ?? null,
      url: artifact.url ?? null,
    });
  }

  /**
   * Persists an auditable write-related action or approval event.
   */
  async recordWriteAction(entry: AuditLogEntry): Promise<void> {
    await this.client('ai_audit_logs').insert({
      id: entry.id,
      run_id: entry.runId,
      agent_id: entry.agentId,
      action: entry.action,
      tool_id: entry.toolId ?? null,
      payload: entry.payload ? JSON.stringify(entry.payload) : null,
      actor: entry.actor ?? null,
    });
  }
}
