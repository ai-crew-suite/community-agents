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
import type { SearchArcheologyConfig } from './config';
import { KNOWLEDGE_ARCHEOLOGY_WORKFLOW_ID } from './workflow/ArcheologyGraph';

/** Stable AI Core route ID for legacy-system expertise research. */
export const SEARCH_ARCHEOLOGY_AGENT_ID = 'search-ai-archeology';

/** Available read-only evidence tools; commit/blame tooling is intentionally absent. */
export const SEARCH_ARCHEOLOGY_TOOL_IDS = ['project.ticket.search', 'project.ticket.get'] as const;

/** Prompt posture that forbids skill/performance claims and invented identities. */
export const SEARCH_ARCHEOLOGY_SYSTEM_PROMPT =
  'Rank only supplied cited familiarity evidence. ' +
  'Never characterize skill, performance, merit, or productivity. ' +
  'Never invent people, teams, commits, PRs, or tickets. ' +
  'Preserve unresolved and offboarded contributors explicitly.';

/** Creates the read-only session-memory archeology research agent. */
export const createSearchArcheologyAgent = (config: SearchArcheologyConfig): AgentDefinition => ({
  id: SEARCH_ARCHEOLOGY_AGENT_ID,
  modelRef: config.modelRef,
  workflowRef: KNOWLEDGE_ARCHEOLOGY_WORKFLOW_ID,
  memory: 'none',
  systemPrompt: SEARCH_ARCHEOLOGY_SYSTEM_PROMPT,
  toolIds: [...SEARCH_ARCHEOLOGY_TOOL_IDS],
  triggers: [{ id: 'archeology-research-on-demand', source: 'manual', agentId: SEARCH_ARCHEOLOGY_AGENT_ID }]
});
