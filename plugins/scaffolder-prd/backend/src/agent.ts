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
import type { ScaffolderPrdConfig } from './config';
import { SCAFFOLDER_PRD_WORKFLOW_ID } from './workflow/PrdGraph';

/** Stable AI Core route ID for cited PRD delivery blueprints. */
export const SCAFFOLDER_PRD_AGENT_ID = 'scaffolder-ai-prd';

/** Read-only tools reserved for future channel enrichment; blueprint generation is pure today. */
export const SCAFFOLDER_PRD_TOOL_IDS = [
  'project.ticket.search',
  'project.ticket.get',
  'vcs.repository.read_file',
  'knowledge.retrieve',
] as const;

/** Evidence-only instruction for PRD channel drafting. */
export const SCAFFOLDER_PRD_SYSTEM_PROMPT = 'Derive only cited delivery items from the supplied PRD spans. Never invent scope, template references, parameter fields, tickets, approvals, or task execution.';

/** Creates the sessionless blueprint-only PRD translation agent. */
export const createScaffolderPrdAgent = (config: ScaffolderPrdConfig): AgentDefinition => ({
  id: SCAFFOLDER_PRD_AGENT_ID,
  modelRef: config.modelRef,
  workflowRef: SCAFFOLDER_PRD_WORKFLOW_ID,
  memory: 'none',
  systemPrompt: SCAFFOLDER_PRD_SYSTEM_PROMPT,
  toolIds: [...SCAFFOLDER_PRD_TOOL_IDS],
  triggers: [
    {
      id: 'prd-translation-on-demand',
      source: 'manual',
      agentId: SCAFFOLDER_PRD_AGENT_ID,
    },
  ],
});
