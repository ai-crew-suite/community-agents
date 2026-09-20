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
import type { HandoverBrief } from '../workflow/state';

/** Artifact kind emitted for a finalized shift handover brief. */
export const ONCALL_HANDOVER_BRIEF_ARTIFACT_KIND = 'oncall-handover-brief';

/**
 * Creates the replayable artifact event carrying the serialized handover brief.
 *
 * @param runId - The unique session identifier for the current workflow run.
 * @param brief - The compiled, structured handover brief data to pass down.
 * @returns A structured AgentEvent containing the serialized payload.
 */
export const createHandoverBriefArtifactEvent = (
  runId: string,
  brief: HandoverBrief
): AgentEvent => ({
  type: 'artifact',
  data: {
    runId,
    kind: ONCALL_HANDOVER_BRIEF_ARTIFACT_KIND,
    ref: JSON.stringify(brief),
  },
});
