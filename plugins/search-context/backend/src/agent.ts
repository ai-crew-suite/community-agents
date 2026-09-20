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
import type { SearchContextConfig } from './config';
import { CROSS_SERVICE_IMPACT_WORKFLOW_ID } from './workflow/ImpactGraph';

/** Stable AI Core route identifier for source-change impact assessment. */
export const SEARCH_CONTEXT_AGENT_ID = 'search-ai-context';

/** Read-only tool allow-list; catalog access is injected through a resolver. */
export const SEARCH_CONTEXT_TOOL_IDS = [
  'vcs.repository.search',
  'vcs.repository.read_file',
  'knowledge.retrieve',
] as const;

/** Evidence posture for any optional narrative generation. */
export const SEARCH_CONTEXT_SYSTEM_PROMPT =
  'Quote supplied classifications and citations verbatim. Never invent a consumer, owner, repository, path, or line. A code search match is a textual reference, not proven breakage; documentation cannot upgrade an impact classification.';

/** Creates the fresh-snapshot, read-only impact assessment agent. */
export const createSearchContextAgent = (
  config: SearchContextConfig,
): AgentDefinition => ({
  id: SEARCH_CONTEXT_AGENT_ID,
  modelRef: config.modelRef,
  workflowRef: CROSS_SERVICE_IMPACT_WORKFLOW_ID,
  memory: 'none',
  systemPrompt: SEARCH_CONTEXT_SYSTEM_PROMPT,
  toolIds: [...SEARCH_CONTEXT_TOOL_IDS],
  triggers: [
    {
      id: 'impact-analysis-on-demand',
      source: 'manual',
      agentId: SEARCH_CONTEXT_AGENT_ID,
    },
  ],
});
