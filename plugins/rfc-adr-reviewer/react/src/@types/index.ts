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
 * Wire types for the RFC/ADR AI reviewer frontend. These mirror the backend
 * reviewer module and the shared AI Core run-event contract; they are
 * duplicated here because the backend packages are not isomorphic and must
 * never be pulled into a browser bundle.
 */

/** Parallel review channel a finding or streamed turn belongs to. */
export type ReviewChannel = 'senior-architect' | 'security-lead';

/** Versioned browser request selecting one RFC/ADR document at a repository ref. */
export type ReviewRequest = {
  /** Request schema version; the backend rejects unknown versions. */
  version: 1;
  /** How the run was initiated. */
  source: 'manual' | 'events';
  /** Repository URL hosting the design document. */
  repoUrl: string;
  /** Document path; the backend requires an `adr/` or `rfc/` prefix. */
  path: string;
  /** Optional commit or branch ref to read the document at. */
  ref?: string;
  /** Optional pull-request identifier, required before a critique can be posted. */
  pullRequestId?: string;
};

/**
 * Form values the UI collects to start a review. The API client normalizes
 * these into a full {@link ReviewRequest} by defaulting `version` to `1` and
 * `source` to `manual`.
 */
export type StartReviewInput = Omit<ReviewRequest, 'version' | 'source'>;

/**
 * One bounded, redacted evidence observation. Evidence entries are the only
 * valid citation targets, so the backend drops uncited findings.
 */
export type ReviewEvidence = {
  /** Stable evidence identifier used by finding citations. */
  id: string;
  /** System the observation came from. */
  source: 'document' | 'vcs' | 'compliance' | 'knowledge';
  /** Redacted, bounded human-readable summary. */
  summary: string;
  /** Optional stable reference such as a deep link or document path. */
  reference?: string;
};

/** One cited finding contributed by a single parallel review channel. */
export type ReviewFinding = {
  /** Stable finding identifier (for example `arch-1` or `sec-1`). */
  id: string;
  /** Review channel that produced the finding. */
  channel: ReviewChannel;
  /** Severity driving the merged verdict. */
  severity: 'critical' | 'high' | 'medium' | 'low';
  /** Redacted, bounded description of the concern. */
  summary: string;
  /** Evidence IDs supporting the finding; never empty for retained findings. */
  citations: string[];
};

/**
 * Merged design critique persisted as the `design-critique` run artifact. The
 * verdict is derived deterministically in the backend from finding severities;
 * the model never chooses it.
 */
export type DesignCritique = {
  repoUrl: string;
  path: string;
  /** Advisory governance outcome derived from the highest retained severity. */
  verdict: 'block' | 'comment' | 'approve';
  /** Cited findings merged from both channels, capped by backend config. */
  findings: ReviewFinding[];
  /** Reasons the review is incomplete (missing drivers, disabled publishing, caps). */
  limitations: string[];
  /** Retained evidence bundle backing every citation. */
  evidence: ReviewEvidence[];
};

/**
 * Publication artifact emitted once an approved run posts the critique as a
 * pull-request comment. Only produced by a write-enabled backend milestone.
 */
export type CritiquePublication = {
  repoUrl: string;
  pullRequestId: string;
  /** Deep link to the posted comment, when the VCS driver returns one. */
  url?: string;
  /** Reference to the critique artifact that was published. */
  critiqueRef?: string;
};

/** Human decision submitted to AI Core for a pending publish approval. */
export type ApprovalDecision = {
  status: 'approved' | 'rejected';
  note?: string;
  decidedBy?: string;
};

/**
 * Run events streamed by AI Core over SSE. `step` is node-tagged, and `token`
 * carries an optional generic `node` label so multi-node workflows can be
 * demultiplexed into per-channel columns.
 */
export type AiRunEvent =
  | {
      type: 'step';
      data: {
        runId: string;
        seq: number;
        node: string;
        phase: 'enter' | 'exit';
      };
    }
  | { type: 'token'; data: { runId: string; text: string; node?: string } }
  | { type: 'tool_call'; data: { runId: string; tool: string; args: unknown } }
  | {
      type: 'tool_result';
      data: { runId: string; tool: string; ok: boolean; summary?: string };
    }
  | {
      type: 'usage';
      data: { runId: string; input: number; output: number; total: number };
    }
  | {
      type: 'approval_request';
      data: {
        runId: string;
        approvalId: string;
        reason: string;
        effect: 'read' | 'write';
      };
    }
  | {
      type: 'artifact';
      data: { runId: string; kind: string; url?: string; ref?: string };
    }
  | { type: 'done'; data: { runId: string } }
  | { type: 'error'; data: { runId: string; message: string } };
