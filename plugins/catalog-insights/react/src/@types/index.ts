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
 * Wire types for the catalog AI insights frontend. These mirror the backend
 * insights module and AI Core run-event contracts; they are duplicated here
 * because the backend packages are not isomorphic and must not be imported
 * into a frontend bundle.
 */

/**
 * Question intent classes that route context gathering. Classification is
 * deterministic in the backend; the model never chooses an intent.
 */
export type InsightIntent =
  | 'ownership-oncall'
  | 'observability-links'
  | 'deployment-health'
  | 'general-context';

/** Systems a context observation can come from. */
export type ContextItemSource =
  | 'catalog'
  | 'incident'
  | 'observability'
  | 'kubernetes'
  | 'vcs'
  | 'knowledge';

/**
 * A single redacted, bounded context observation. Context items are the only
 * valid citation targets in a report.
 */
export type ContextItem = {
  /** Stable, unique context identifier (`ctx-N`) used for report citations. */
  id: string;
  /** System the observation came from. */
  source: ContextItemSource;
  /** Context category, such as `entity-summary`, `oncall`, `dashboard-link`, or `doc-chunk`. */
  kind: string;
  /** ISO timestamp of the observation, when known. */
  observedAt?: string;
  /** Redacted, bounded human-readable summary. */
  summary: string;
  /** Optional stable reference (deep link, entity ref, artifact ID). */
  reference?: string;
};

/** Versioned insight request carried in the agent run query. */
export type CatalogInsightRequest = {
  /** Request schema version. */
  version: 1;
  /** Target catalog entity reference, e.g. `component:default/payment-gateway`. */
  entityRef: string;
  /** Natural-language question, bounded in length. */
  question: string;
  /** How the run was initiated. */
  source: 'manual' | 'scheduler';
  /** Optional conversation session ID for follow-up continuity. */
  sessionId?: string;
  /** Optional UI hint; accepted only when the classifier agrees or is unsure. */
  intentHint?: InsightIntent;
};

/**
 * Payload the UI supplies when asking a question. The API client normalizes
 * this into a full `CatalogInsightRequest` (defaulting `version` to `1` and
 * `source` to `manual`), so callers supply only the question fields.
 */
export type AskInsightInput = {
  entityRef: string;
  question: string;
  sessionId?: string;
  intentHint?: InsightIntent;
};

/** Structured insight report persisted as a run artifact. */
export type CatalogInsightReport = {
  entityRef: string;
  question: string;
  /** Deterministic intent that routed context gathering. */
  intent: InsightIntent;
  /** Outcome of the insight run. */
  status: 'answered' | 'partial' | 'insufficient_context';
  /** Answer blocks; every block cites retained context IDs. */
  answer: { text: string; citations: string[] }[];
  /** Deep links surfaced for the user (dashboards, PRs, entity pages). */
  links: { label: string; url: string; citation: string }[];
  /** Reasons the answer is incomplete (missing drivers, annotations, caps). */
  limitations: string[];
  /** The retained, normalized context bundle for UI display. */
  context: ContextItem[];
};

/** Run events streamed by AI Core (mirrors the backend `AgentEvent` union). */
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
  | { type: 'token'; data: { runId: string; text: string } }
  | { type: 'tool_call'; data: { runId: string; tool: string; args: unknown } }
  | {
      type: 'tool_result';
      data: {
        runId: string;
        tool: string;
        ok: boolean;
        summary?: string;
        output?: unknown;
      };
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
  | { type: 'done'; data: { runId: string; sessionId?: string } }
  | { type: 'error'; data: { runId: string; message: string } };
