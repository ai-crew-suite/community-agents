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
import type { ScaffolderIntentConfig } from './config';
import { SCAFFOLDER_INTENT_WORKFLOW_ID } from './workflow/IntentGraph';

/** Stable AI Core route identifier for schema-grounded Scaffolder intent proposals. */
export const SCAFFOLDER_INTENT_AGENT_ID = 'scaffolder-ai-intent';

/** Read-only supplemental tools; task creation is never exposed as a model tool. */
export const SCAFFOLDER_INTENT_TOOL_IDS = [
  'vcs.repository.get_metadata',
  'compliance.policy.evaluate',
  'compliance.architecture.validate',
  'knowledge.retrieve',
] as const;

/** Grounding prompt for future narrative/correction turns. */
export const SCAFFOLDER_INTENT_SYSTEM_PROMPT = 'Use only configured templates and schema-declared fields. Never invent a template, parameter, catalog availability result, confirmation, or task execution.';

/** Creates the session-memory intent proposal agent. */
export const createScaffolderIntentAgent = (config: ScaffolderIntentConfig): AgentDefinition => ({
  id: SCAFFOLDER_INTENT_AGENT_ID,
  modelRef: config.modelRef,
  workflowRef: SCAFFOLDER_INTENT_WORKFLOW_ID,
  memory: 'session',
  systemPrompt: SCAFFOLDER_INTENT_SYSTEM_PROMPT,
  toolIds: [...SCAFFOLDER_INTENT_TOOL_IDS],
  triggers: [
    {
      id: 'intent-request-on-demand',
      source: 'manual',
      agentId: SCAFFOLDER_INTENT_AGENT_ID,
    },
  ],
});
