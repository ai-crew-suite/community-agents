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
import type { ScaffolderGuardrailConfig } from './config';
import { SCAFFOLDER_GUARDRAIL_WORKFLOW_ID } from './workflow/GuardrailGraph';

/** Stable AI Core route identifier for advisory Scaffolder guardrails. */
export const SCAFFOLDER_GUARDRAIL_AGENT_ID = 'scaffolder-ai-guardrail-agent';

/** Every registered tool is read-only; the approval gate resolves parameters, never performs a write. */
export const SCAFFOLDER_GUARDRAIL_TOOL_IDS = [
  'compliance.policy.evaluate',
  'compliance.architecture.validate',
  'compliance.cost.estimate',
  'compliance.permission.check'
] as const;

/** Prompt posture forbidding model-derived verdicts, costs, and mutation values. */
export const SCAFFOLDER_GUARDRAIL_SYSTEM_PROMPT =
  'Use only the supplied deterministic policy verdicts, violations, costs, and alternatives. ' +
  'Cite pol-N, arch-N, or cost-N evidence for every claim. ' +
  'Never invent policies, parameter values, costs, or an exemption. ' +
  'This is advisory-only and never executes a Scaffolder task.';

/** Creates the session-memory advisory guardrail agent definition. */
export const createScaffolderGuardrailAgent = (
  config: ScaffolderGuardrailConfig
): AgentDefinition => ({
  id: SCAFFOLDER_GUARDRAIL_AGENT_ID,
  modelRef: config.modelRef,
  workflowRef: SCAFFOLDER_GUARDRAIL_WORKFLOW_ID,
  memory: 'session',
  systemPrompt: SCAFFOLDER_GUARDRAIL_SYSTEM_PROMPT,
  toolIds: [...SCAFFOLDER_GUARDRAIL_TOOL_IDS],
  triggers: [
    { id: 'guardrail-preflight-on-demand', source: 'manual', agentId: SCAFFOLDER_GUARDRAIL_AGENT_ID }
  ]
});
