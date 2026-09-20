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
import type { ShadowDetectiveConfig } from './config';
import { SHADOW_RECONCILIATION_WORKFLOW_ID } from './workflow/ReconciliationGraph';

/** Stable AI Core route ID for read-only cloud shadow resource reconciliation. */
export const SHADOW_DETECTIVE_AGENT_ID = 'scaffolder-ai-shadow-detective';

/** Read-only inventory tool required for a report-only reconciliation. */
export const SHADOW_DETECTIVE_TOOL_IDS = ['cloud.resource.lookup'] as const;

/** Grounding policy for future rationale and outreach composition. */
export const SHADOW_DETECTIVE_SYSTEM_PROMPT = 'Report only supplied cloud, catalog, and tag evidence. Never invent an owner, claim URL, resource, catalog binding, or deletion recommendation.';

/** Creates the fresh-snapshot shadow resource detective agent. */
export const createShadowDetectiveAgent = (config: ShadowDetectiveConfig): AgentDefinition => ({
  id: SHADOW_DETECTIVE_AGENT_ID,
  modelRef: config.modelRef,
  workflowRef: SHADOW_RECONCILIATION_WORKFLOW_ID,
  memory: 'none',
  systemPrompt: SHADOW_DETECTIVE_SYSTEM_PROMPT,
  toolIds: [...SHADOW_DETECTIVE_TOOL_IDS],
  triggers: [
    {
      id: 'shadow-reconciliation-on-demand',
      source: 'manual',
      agentId: SHADOW_DETECTIVE_AGENT_ID,
    },
  ],
});
