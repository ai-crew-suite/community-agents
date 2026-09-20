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
import type { TechRadarConfig } from './config';
import { TECH_RADAR_WORKFLOW_ID } from './workflow/RadarGraph';

/** Stable route ID for deterministic technology radar analysis. */
export const TECH_RADAR_AGENT_ID = 'tech-radar-ai-manager';

/** Current read-only tool allow-list. */
export const TECH_RADAR_TOOL_IDS = ['vcs.repository.read_file'] as const;

/** Evidence-only prompt posture forbidding inferred rings and writes. */
export const TECH_RADAR_SYSTEM_PROMPT =
  'Use only parsed radar entries and direct manifest dependencies. Never infer rings, claim durable submission, or submit a radar proposal.';

/** Creates the stateless read-only technology radar agent. */
export const createTechRadarAgent = (
  config: TechRadarConfig,
): AgentDefinition => ({
  id: TECH_RADAR_AGENT_ID,
  modelRef: config.modelRef,
  workflowRef: TECH_RADAR_WORKFLOW_ID,
  memory: 'none',
  systemPrompt: TECH_RADAR_SYSTEM_PROMPT,
  toolIds: [...TECH_RADAR_TOOL_IDS],
  triggers: [
    {
      id: 'tech-radar-analysis-on-demand',
      source: 'manual',
      agentId: TECH_RADAR_AGENT_ID,
    },
  ],
});
