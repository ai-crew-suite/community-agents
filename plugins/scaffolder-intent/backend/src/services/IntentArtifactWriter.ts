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
import type { AgentEvent } from '@ai-crew-suite/plugin-kernel-node';
import type { ScaffolderIntentProposal } from '../workflow/state';

/** Artifact kind emitted for schema-backed Scaffolder intent proposals. */
export const TEMPLATE_INTENT_PROPOSAL_ARTIFACT = 'template-intent-proposal';

/** Creates a replayable intent proposal artifact event. */
export const intentProposalArtifact = (runId: string, proposal: ScaffolderIntentProposal): AgentEvent => ({
  type: 'artifact',
  data: {
    runId,
    kind: TEMPLATE_INTENT_PROPOSAL_ARTIFACT,
    ref: JSON.stringify(proposal),
  },
});
