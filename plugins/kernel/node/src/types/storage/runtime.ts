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

/**
 * ============================================================================
 *   LIFECYCLE RUN LIFECYCLE MANAGEMENT
 * ============================================================================
 */

/**
 * Persisted summary record for an agent run.
 */
export type RunRecord = {
  /** Unique run identifier. */
  id: string;
  /** Agent executed by the run. */
  agentId: string;
  /** Optional session associated with the run. */
  sessionId?: string;
  /** Current lifecycle status for the run. */
  status: 'initialized' | 'running' | 'paused' | 'done' | 'error';
  /** Optional trigger source that started the run. */
  trigger?: string;
  /** Optional idempotency key used to deduplicate run creation. */
  idempotencyKey?: string;
  /** Mandatory timestamp tracking when the run structure was initialized. */
  createdAt: string;
};

/**
 * Persisted event emitted during an agent run.
 */
export type RunStepRecord = {
  /** Monotonic sequence number for replaying events in order. */
  seq: number;
  /** Event type name. */
  type: string;
  /** Serialized event payload. */
  payload: unknown;
};

/**
 * Artifact produced by an agent run.
 */
export type Artifact = {
  /** Unique artifact identifier. */
  id: string;
  /** Run that produced the artifact. */
  runId: string;
  /** Artifact category, such as `doc`, `draft`, or `final_answer`. */
  kind: string;
  /** Optional stable reference name for the artifact. */
  ref?: string;
  /** Optional URL where the artifact can be retrieved. */
  url?: string;
};

/**
 * Audit record for write actions and approval decisions.
 */
export type AuditLogEntry = {
  /** Unique audit entry identifier. */
  id: string;
  /** Run associated with the audited action. */
  runId: string;
  /** Agent associated with the audited action. */
  agentId: string;
  /** Action name, such as `write_tool_call` or `approval_approved`. */
  action: string;
  /** Optional tool ID involved in the action. */
  toolId?: string;
  /** Optional sanitized payload for diagnostics and compliance review. */
  payload?: unknown;
  /** Optional actor identity that initiated or approved the action. */
  actor?: string;
};

/**
 * Human decision for a pending approval request.
 */
export type ApprovalDecision = {
  /** Whether the requested action is allowed to continue. */
  status: 'approved' | 'rejected';
  /** Optional reviewer note explaining the decision. */
  note?: string;
  /** Optional identity of the reviewer who made the decision. */
  decidedBy?: string;
};

/**
 * Pending approval request emitted when an agent needs human authorization.
 */
export type ApprovalRequest = {
  /** Unique approval identifier. */
  id: string;
  /** Run waiting on this approval. */
  runId: string;
  /** Human-readable reason approval is required. */
  reason: string;
  /** Effect level of the pending action. */
  effect: 'read' | 'write';
};

/**
 * Store for run lifecycle, event replay, and approval state.
 */
export interface RunStore {
  /** Creates the initial persisted record for a run. */
  createRun(record: RunRecord): Promise<void>;
  /** Returns a run record by ID, or `undefined` when not found. */
  getRun(runId: string): Promise<RunRecord | undefined>;
  /** Returns a run previously created with the idempotency key, if any. */
  findRunByIdempotencyKey(key: string): Promise<RunRecord | undefined>;
  /** Updates the lifecycle status for a run. */
  updateRunStatus(runId: string, status: RunRecord['status']): Promise<void>;
  /** Appends an event payload to the run event log. */
  appendRunStep(runId: string, seq: number, type: string, payload: unknown): Promise<void>;
  /** Lists run events, optionally returning only events after the supplied sequence. */
  listRunSteps(runId: string, sinceSeq?: number): Promise<RunStepRecord[]>;
  /** Persists a pending approval request for a run. */
  createApproval(request: ApprovalRequest): Promise<void>;
  /** Returns the current pending approval request for a run, if one exists. */
  getPendingApproval(runId: string): Promise<ApprovalRequest | undefined>;
  /** Records the human decision for a run approval. */
  decideApproval(runId: string, decision: ApprovalDecision): Promise<void>;
}

/**
 * ============================================================================
 *   CONVERSATIONAL MEMORY SESSIONS
 * ============================================================================
 */

/**
 * Persisted conversational message for session memory.
 */
export type SessionMessage = {
  /** Role that authored the message. */
  role: 'user' | 'assistant' | 'system';
  /** Message text content. */
  content: string;
  /** Optional token accounting associated with this message. */
  tokenUsage?: {
    /** Number of input tokens consumed. */
    input: number;
    /** Number of output tokens produced. */
    output: number;
    /** Total token count for the operation. */
    total: number;
  };
  /** Optional ISO timestamp for when the message was created. */
  createdAt?: string;
};

/**
 * Store for persisted agent conversation sessions.
 */
export interface SessionStore {
  /** Creates a new session for an agent and optional user, returning its ID. */
  createSession(agentId: string, userRef?: string): Promise<string>;
  /** Appends a message to an existing session. */
  appendMessage(sessionId: string, message: SessionMessage): Promise<void>;
  /** Lists recent messages for a session, optionally limited by count. */
  listMessages(sessionId: string, limit?: number): Promise<SessionMessage[]>;
}

/**
 * ============================================================================
 *   RESUMABLE GRAPH CHECKPOINTS
 * ============================================================================
 */

/**
 * Persisted snapshot of workflow state at a graph position. Append-only; never overwritten.
 * Only the `state` blob is sensitive; routing metadata stays readable for resume/retention.
 */
export type CheckpointRecord = {
  runId: string;
  /** Monotonic checkpoint number within the run. */
  seq: number;
  /** Graph node the graph will enter next (absent = complete). */
  nextNode?: string;
  /** Zod-validated, versioned workflow state snapshot. */
  state: unknown;
  stateVersion: number;
  /** Pending interrupt payload when the graph is paused for approval. */
  pendingApproval?: { approvalId: string; node: string; reason: string };
  createdAt: string;
};

/**
 * Store for resumable orchestration state. Append-only; `put` is idempotent on (runId, seq)
 * so executor retries cannot double-write.
 */
export interface CheckpointStore {
  put(record: CheckpointRecord): Promise<void>;
  getLatest(runId: string): Promise<CheckpointRecord | undefined>;
  list(runId: string): Promise<CheckpointRecord[]>;
  delete(runId: string): Promise<void>;
}

/**
 * Wire format a checkpoint takes when persisted. Only `payload` is opaque (ciphertext when
 * an encrypting serializer is registered, JSON otherwise). Metadata columns stay readable.
 */
export type PersistedCheckpoint = {
  runId: string;
  seq: number;
  payload: Uint8Array | string;
  serializerId: string;
  nextNode?: string;
  stateVersion: number;
  createdAt: string;
};

/**
 * Transforms a checkpoint record to/from its persisted representation. The default is
 * pass-through JSON; an enterprise supplies an encrypting implementation (e.g. KMS envelope)
 * via `runtimeStoreExtensionPoint.setStateSerializer`. The engine is unaware of it.
 */
export interface StateSerializer {
  readonly serializerId: string;
  serialize(record: CheckpointRecord): Promise<PersistedCheckpoint>;
  deserialize(record: PersistedCheckpoint): Promise<CheckpointRecord>;
}

/**
 * ============================================================================
 *   METRICS & COST TRACKING SINKS
 * ============================================================================
 */

/**
 * Structured, queryable token-usage record (replaces usage-as-unstructured-step-JSON).
 */
export type UsageRecord = {
  runId: string;
  agentId: string;
  workflowRef: string;
  node?: string;
  modelRef: string;
  input: number;
  output: number;
  total: number;
  createdAt: string;
};

/**
 * Filter for reading back usage records. All fields optional.
 */
export type UsageFilter = {
  runId?: string;
  agentId?: string;
  workflowRef?: string;
  modelRef?: string;
  since?: string;
  until?: string;
};

/**
 * Sink + reader for structured token usage (cost monitoring).
 */
export interface UsageSink {
  record(entry: UsageRecord): Promise<void>;
  list(filter: UsageFilter): Promise<UsageRecord[]>;
}

/**
 * Sinks for tracking emitted runtime artifacts.
 */
export interface ArtifactSink {
  /** Persists or forwards an artifact record. */
  record(artifact: Artifact): Promise<void>;
}

/**
 * Sink for recording auditable write-related actions.
 */
export interface AuditLogSink {
  /** Records an auditable write action, approval decision, or artifact write. */
  recordWriteAction(entry: AuditLogEntry): Promise<void>;
}
