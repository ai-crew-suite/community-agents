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
import type { OncallHandoverConfig } from './config';

/** Stable agent route identifier. */
export const ONCALL_HANDOVER_AGENT_ID = 'oncall-handover-assistant';

/** Read-only operational tools used to compile a handover brief. */
export const ONCALL_HANDOVER_TOOL_IDS = [
  'incident.alert.history',
  'incident.incident.list',
  'incident.incident.get',
  'incident.oncall.get',
  'kubernetes.workload.get_timeline',
  'kubernetes.workload.list_events',
  'kubernetes.workload.get_snapshot',
  'vcs.pull_request.list',
  'project.ticket.search',
  'project.ticket.get',
  'knowledge.retrieve',
] as const;

/** Evidence-only system prompt for the handover summarizer. */
export const ONCALL_HANDOVER_SYSTEM_PROMPT =
  'Summarize only the supplied clustered signal bundle. Cite sig-N IDs for every statement. Rank active incidents, unresolved tickets, risky deployments, then noise. Say "no data available for this source" when absent. Never invent alert counts, PR authors, or ticket statuses.';

/**
 * Creates the fresh-window, read-only handover agent definition.
 * Couples core LLM reference indicators with standard triggers and platform capabilities.
 *
 * @param config - The parsed runtime configuration properties containing model references.
 * @returns A structured, read-only AgentDefinition configuration schema.
 */
export const createOncallHandoverAgent = (config: OncallHandoverConfig): AgentDefinition => ({
  id: ONCALL_HANDOVER_AGENT_ID,
  modelRef: config.modelRef,
  workflowRef: 'oncall-handover',
  memory: 'none',
  systemPrompt: ONCALL_HANDOVER_SYSTEM_PROMPT,
  toolIds: [...ONCALL_HANDOVER_TOOL_IDS],
  triggers: [
    {
      id: 'oncall-handover-on-demand',
      source: 'manual',
      agentId: ONCALL_HANDOVER_AGENT_ID,
    },
    {
      id: 'oncall-handover-shift-change',
      source: 'scheduler',
      agentId: ONCALL_HANDOVER_AGENT_ID,
    },
  ],
});
