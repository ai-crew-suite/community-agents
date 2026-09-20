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
import type { PostmortemConfig } from './config';
import { TECHDOCS_POSTMORTEM_WORKFLOW_ID } from './workflow/PostmortemGraph';

/** Stable route ID for incident postmortem timeline drafting. */
export const TECHDOCS_POSTMORTEM_AGENT_ID = 'techdocs-ai-postmortem';

/** Current read-only incident timeline tool allow-list. */
export const TECHDOCS_POSTMORTEM_TOOL_IDS = ['incident.incident.get', 'incident.alert.history'] as const;

/** Blameless prompt posture that forbids causal claims, attribution, and publication. */
export const TECHDOCS_POSTMORTEM_SYSTEM_PROMPT = 'Write only a cited chronology from supplied incident and alert events. Never assign blame, infer root cause, invent evidence, or publish documentation.';

/** Creates a stateless read-only postmortem timeline agent. */
export const createTechdocsPostmortemAgent = (config: PostmortemConfig): AgentDefinition => ({
  id: TECHDOCS_POSTMORTEM_AGENT_ID,
  modelRef: config.modelRef,
  workflowRef: TECHDOCS_POSTMORTEM_WORKFLOW_ID,
  memory: 'none',
  systemPrompt: TECHDOCS_POSTMORTEM_SYSTEM_PROMPT,
  toolIds: [...TECHDOCS_POSTMORTEM_TOOL_IDS],
  triggers: [
    {
      id: 'postmortem-on-demand',
      source: 'manual',
      agentId: TECHDOCS_POSTMORTEM_AGENT_ID,
    },
  ],
});
