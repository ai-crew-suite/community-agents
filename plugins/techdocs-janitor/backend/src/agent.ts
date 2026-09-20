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
import type { TechdocsJanitorConfig } from './config';
import { TECHDOCS_JANITOR_WORKFLOW_ID } from './workflow/JanitorGraph';

/** Stable route ID for TechDocs janitor audits. */ export const TECHDOCS_JANITOR_AGENT_ID =
  'techdocs-ai-janitor';
/** Current strictly read-only audit tool allow-list. */ export const TECHDOCS_JANITOR_TOOL_IDS =
  ['vcs.repository.read_file'] as const;
/** Prompt posture prohibiting fabricated URLs, source mutations, and external-link claims. */ export const TECHDOCS_JANITOR_SYSTEM_PROMPT =
  'Use only cited catalog and markdown evidence. Never claim an external URL is broken, invent replacements, write a file, or open a pull request.';
/** Creates the stateless read-only TechDocs janitor agent. */ export const createTechdocsJanitorAgent =
  (config: TechdocsJanitorConfig): AgentDefinition => ({
    id: TECHDOCS_JANITOR_AGENT_ID,
    modelRef: config.modelRef,
    workflowRef: TECHDOCS_JANITOR_WORKFLOW_ID,
    memory: 'none',
    systemPrompt: TECHDOCS_JANITOR_SYSTEM_PROMPT,
    toolIds: [...TECHDOCS_JANITOR_TOOL_IDS],
    triggers: [
      {
        id: 'techdocs-audit-on-demand',
        source: 'manual',
        agentId: TECHDOCS_JANITOR_AGENT_ID,
      },
    ],
  });
