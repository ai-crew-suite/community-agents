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
import type { RfcAdrReviewerConfig } from './config';

/** Stable AI Core route identifier for the RFC/ADR reviewer. */
export const RFC_ADR_REVIEWER_AGENT_ID = 'rfc-adr-ai-reviewer';

/** Read-only tools used by the parallel architecture and security channels. */
export const RFC_ADR_REVIEWER_TOOL_IDS = [
  'vcs.repository.read_file',
  'vcs.repository.get_metadata',
  'compliance.architecture.validate',
  'compliance.policy.evaluate',
  'knowledge.retrieve',
] as const;

/** Evidence-only prompt for the custom parallel review workflow. */
export const RFC_ADR_REVIEWER_SYSTEM_PROMPT =
  'Review only the supplied RFC/ADR document and evidence. Every finding must cite evidence IDs. ' +
  'Never invent entities, policies, or compliance results. This workflow is advisory and read-only.';

/**
 * Creates the read-only, draft-only RFC/ADR reviewer agent definition.
 * Hooks tool integrations, custom prompt engineering safeguards, and manual execution triggers together.
 *
 * @param config - The parsed runtime system configurations containing model pointer references.
 * @returns A structured, type-safe AgentDefinition configuration object.
 */
export const createRfcAdrReviewerAgent = (config: RfcAdrReviewerConfig): AgentDefinition => ({
  id: RFC_ADR_REVIEWER_AGENT_ID,
  modelRef: config.modelRef,
  workflowRef: 'rfc-adr-review',
  memory: 'none',
  systemPrompt: RFC_ADR_REVIEWER_SYSTEM_PROMPT,
  toolIds: [...RFC_ADR_REVIEWER_TOOL_IDS],
  triggers: [
    {
      id: 'rfc-adr-review-on-demand',
      source: 'manual',
      agentId: RFC_ADR_REVIEWER_AGENT_ID
    }
  ],
});
