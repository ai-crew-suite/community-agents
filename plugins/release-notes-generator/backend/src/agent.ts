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
import type { ReleaseNotesConfig } from './config';

/** Stable AI Core route identifier for release-note generation. */
export const RELEASE_NOTES_AGENT_ID = 'release-notes-ai-generator';

/** Read-only tool allow-list used by the current draft-only release workflow. */
export const RELEASE_NOTES_TOOL_IDS = [
  'vcs.pull_request.list',
  'project.ticket.get',
  'project.ticket.search',
  'knowledge.retrieve',
] as const;

/** Grounding prompt restricting model work to copy rewriting, not inclusion decisions. */
export const RELEASE_NOTES_SYSTEM_PROMPT =
  'Rewrite only the deterministically included changes into customer-facing release notes. ' +
  'Every note must cite one or more supplied chg-N IDs. Never include internal chores, ' +
  'invent versions, authors, tickets, or changes not present in the supplied bundle.';

/** Creates the read-only, draft-only release-notes agent definition. */
export const createReleaseNotesAgent = (config: ReleaseNotesConfig): AgentDefinition => ({
  id: RELEASE_NOTES_AGENT_ID,
  modelRef: config.modelRef,
  workflowRef: 'release-notes',
  memory: 'none',
  systemPrompt: RELEASE_NOTES_SYSTEM_PROMPT,
  toolIds: [...RELEASE_NOTES_TOOL_IDS],
  triggers: [
    { id: 'release-notes-on-demand', source: 'manual', agentId: RELEASE_NOTES_AGENT_ID },
    { id: 'release-notes-cadence', source: 'scheduler', agentId: RELEASE_NOTES_AGENT_ID },
  ],
});
