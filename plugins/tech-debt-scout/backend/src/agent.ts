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
import type { TechDebtScoutConfig } from './config';
import { TECH_DEBT_SCOUT_WORKFLOW_ID } from './workflow/ScoutGraph';

/** Stable route identifier for technical-debt scouting. */
export const TECH_DEBT_SCOUT_AGENT_ID = 'tech-debt-ai-scout';
/** Current read-only tool allow-list; ticket creation remains disabled. */
export const TECH_DEBT_SCOUT_TOOL_IDS = ['vcs.repository.search'] as const;
/** Prompt posture forbidding author attribution, secret disclosure, and unsupported claims. */
export const TECH_DEBT_SCOUT_SYSTEM_PROMPT =
  'Use only deterministic, cited code-debt evidence. Never reveal secret values, attribute findings to people, invent CVEs, or open tickets. Scores describe code findings only.';

  /** Creates the stateless, read-only scout agent. */
export const createTechDebtScoutAgent = (
  config: TechDebtScoutConfig,
): AgentDefinition => ({
  id: TECH_DEBT_SCOUT_AGENT_ID,
  modelRef: config.modelRef,
  workflowRef: TECH_DEBT_SCOUT_WORKFLOW_ID,
  memory: 'none',
  systemPrompt: TECH_DEBT_SCOUT_SYSTEM_PROMPT,
  toolIds: [...TECH_DEBT_SCOUT_TOOL_IDS],
  triggers: [
    {
      id: 'debt-scan-on-demand',
      source: 'manual',
      agentId: TECH_DEBT_SCOUT_AGENT_ID,
    },
  ],
});
