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
import type { ScaffolderInfraConfig } from './config';
import { SCAFFOLDER_INFRA_WORKFLOW_ID } from './workflow/InfraGraph';

/** Stable AI Core route identifier for persisted infrastructure generation previews. */
export const SCAFFOLDER_INFRA_AGENT_ID = 'scaffolder-ai-infra';

/** Read-only tools available to the preview runner; the action owns sandbox workspace writes. */
export const SCAFFOLDER_INFRA_TOOL_IDS = [
  'vcs.repository.read_file',
  'compliance.policy.evaluate',
  'compliance.architecture.validate'
] as const;

/** Prompt posture for future role generators: approved blueprints and validated values only. */
export const SCAFFOLDER_INFRA_SYSTEM_PROMPT =
  'Fill only explicit approved blueprint holes with supplied validated values. ' +
  'Never add resources, module sources, credentials, secrets, broad IAM, public ingress, ' +
  'or provider values not present in the blueprint.';

/** Creates the read-only preview agent definition. */
export const createScaffolderInfraAgent = (
  config: ScaffolderInfraConfig
): AgentDefinition => ({
  id: SCAFFOLDER_INFRA_AGENT_ID,
  modelRef: config.modelRef,
  workflowRef: SCAFFOLDER_INFRA_WORKFLOW_ID,
  memory: 'none',
  systemPrompt: SCAFFOLDER_INFRA_SYSTEM_PROMPT,
  toolIds: [...SCAFFOLDER_INFRA_TOOL_IDS],
  triggers: [
    { id: 'infra-generate-on-demand', source: 'manual', agentId: SCAFFOLDER_INFRA_AGENT_ID }
  ]
});
