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
import type { AgentDefinition } from '@ai-crew-suite/plugin-kernel-node';
import type { CatalogAiInsightsConfig } from './config';
import { CATALOG_INSIGHTS_WORKFLOW_ID } from './workflow/CatalogInsightsGraph';

/** Stable identifier for the catalog AI insights agent registered with AI Core. */
export const CATALOG_AI_INSIGHTS_AGENT_ID = 'catalog-ai-insights';

/**
 * Read-only tool allow-list for the insights agent. No write-capable tool is
 * ever listed here; missing drivers degrade to report limitations.
 */
export const CATALOG_AI_INSIGHTS_TOOL_IDS = [
  'knowledge.retrieve',
  'incident.oncall.get',
  'incident.incident.list',
  'observability.dashboard.list',
  'observability.logs.search',
  'kubernetes.workload.resolve',
  'kubernetes.workload.get_snapshot',
  'kubernetes.workload.get_timeline',
  'kubernetes.workload.list_events',
  'kubernetes.pod.get_snapshot',
  'vcs.pull_request.list',
] as const;

/**
 * Base system prompt enforcing the insights agent's evidence-cited posture:
 * answer only from the supplied context bundle, cite context IDs for every
 * claim, state when a source is unavailable in this installation, and never
 * fabricate links, names, or deployment states.
 */
export const CATALOG_AI_INSIGHTS_SYSTEM_PROMPT =
  'Answer operational questions about catalog entities using only the ' +
  'supplied context bundle. Cite context IDs for every claim, say "not ' +
  'available in this installation" when a source is absent, and never ' +
  'fabricate links, names, or deployment states.';

/**
 * Builds the agent definition registered with AI Core for catalog insights.
 */
export const createCatalogAiInsightsAgent = (
  config: CatalogAiInsightsConfig,
): AgentDefinition => ({
  id: CATALOG_AI_INSIGHTS_AGENT_ID,
  modelRef: config.modelRef,
  workflowRef: CATALOG_INSIGHTS_WORKFLOW_ID,
  systemPrompt: CATALOG_AI_INSIGHTS_SYSTEM_PROMPT,
  toolIds: [...CATALOG_AI_INSIGHTS_TOOL_IDS],
  memory: 'session',
  triggers: [
    {
      id: 'catalog-insights-question',
      source: 'manual',
      agentId: CATALOG_AI_INSIGHTS_AGENT_ID,
    },
    {
      id: 'catalog-insights-nightly-scan',
      source: 'scheduler',
      agentId: CATALOG_AI_INSIGHTS_AGENT_ID,
    },
  ],
});
