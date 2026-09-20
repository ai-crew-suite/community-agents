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
import type { CatalogEntitySummary } from '@ai-crew-suite/plugin-kernel-node';

/**
 * Question intent classes that route context gathering. Classification is
 * deterministic (see `intents.ts`); the model never chooses an intent.
 */
export type InsightIntent =
  | 'ownership-oncall'
  | 'observability-links'
  | 'deployment-health'
  | 'general-context';

/**
 * Versioned request payload carried in the agent run query.
 */
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
 * A single redacted, bounded context observation. Context items are the only
 * content allowed into model context and the only valid citation targets in
 * a report.
 */
export type ContextItem = {
  /** Stable, unique context identifier (`ctx-N`) used for report citations. */
  id: string;
  /** System the observation came from. */
  source:
    | 'catalog'
    | 'incident'
    | 'observability'
    | 'kubernetes'
    | 'vcs'
    | 'knowledge';
  /** Context category, such as `entity-summary`, `oncall`, `dashboard-link`, or `doc-chunk`. */
  kind: string;
  /** ISO timestamp of the observation, when known. */
  observedAt?: string;
  /** Redacted, bounded human-readable summary. */
  summary: string;
  /** Optional stable reference (deep link, entity ref, artifact ID). */
  reference?: string;
};

/**
 * Structured insight report persisted as a run artifact.
 */
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

/**
 * Mutable state threaded through the insights graph nodes.
 */
export type InsightRunState = {
  request: CatalogInsightRequest;
  /** Resolved catalog entity summary, set after request validation. */
  entity?: CatalogEntitySummary;
  /** Classified intent, set after intent.classify. */
  intent?: InsightIntent;
  context: ContextItem[];
  limitations: string[];
};
