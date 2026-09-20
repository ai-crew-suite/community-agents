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
import type { InsightIntent } from './state';

/**
 * Deterministic question-to-intent classification. The model never classifies;
 * a pure keyword/pattern router keeps routing free, reproducible, and testable.
 *
 * A caller-supplied `intentHint` is accepted only when it matches the
 * classifier's own decision, or when the classifier would fall back to
 * `general-context` (the hint then supplies a better-targeted tool plan).
 */
export const classifyIntent = (
  question: string,
  intentHint?: InsightIntent,
): InsightIntent => {
  const q = question.toLowerCase();

  const matched: InsightIntent = (() => {
    if (/\b(on[- ]?call|oncall|who owns|owner|ownership|maintainer|contact|responsible|paged|escalat)\b/.test(q)) {
      return 'ownership-oncall';
    }
    if (/\b(log|logs|logging|dashboard|dashboards|metrics|grafana|datadog|monitor|observab|trace|traces|where.*see|where.*find)\b/.test(q)) {
      return 'observability-links';
    }
    if (/\b(deploy|deployment|deployed|release|rollout|fail(ed|ure|ing)?|crash|crashloop|oom|restart|unhealthy|down|last (deploy|release|failure))\b/.test(q)) {
      return 'deployment-health';
    }
    return 'general-context';
  })();

  if (intentHint && (matched === 'general-context' || matched === intentHint)) {
    return intentHint;
  }
  return matched;
};

/**
 * Tool-gathering plan for one intent. Tool IDs are invoked in `order` by the
 * context.gather node; each entry is interpreted by the graph, which supplies
 * intent-appropriate arguments derived from the resolved entity.
 */
export type IntentToolPlan = {
  /** Tool IDs to invoke, in order, for this intent. */
  toolIds: string[];
  /** Whether the plan depends on a `backstage.io/kubernetes-id` annotation. */
  requiresKubernetesAnnotation?: boolean;
  /** Whether the plan depends on an on-call (PagerDuty-style) annotation. */
  requiresOncallAnnotation?: boolean;
};

/**
 * Routing table from intent to the exact tool set the context.gather node is
 * allowed to invoke. Tools outside the plan are never called for that intent.
 */
export const INTENT_TOOL_PLANS: Record<InsightIntent, IntentToolPlan> = {
  'ownership-oncall': {
    toolIds: ['incident.oncall.get', 'incident.incident.list'],
    requiresOncallAnnotation: true,
  },
  'observability-links': {
    toolIds: ['observability.dashboard.list', 'observability.logs.search'],
  },
  'deployment-health': {
    toolIds: [
      'kubernetes.workload.resolve',
      'kubernetes.workload.get_snapshot',
      'kubernetes.workload.list_events',
      'kubernetes.workload.get_timeline',
      'vcs.pull_request.list',
    ],
    requiresKubernetesAnnotation: true,
  },
  'general-context': {
    toolIds: [],
  },
};
