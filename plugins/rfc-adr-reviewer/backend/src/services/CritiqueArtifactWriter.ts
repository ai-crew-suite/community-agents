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
import type { DesignCritique } from '../workflow/state';

/** Artifact kind emitted for a merged design critique. */
export const DESIGN_CRITIQUE_ARTIFACT_KIND = 'design-critique';

/**
 * Creates the replayable event carrying a serialized critique artifact.
 * Packs the unified design critique into a standard platform artifact container event.
 *
 * @param runId - The unique historical run session tracker identifier string.
 * @param critique - The compiled, multi-channel design evaluation report object.
 * @returns A structured AgentEvent record carrying the payload block down the stream.
 */
export const createDesignCritiqueArtifactEvent = (
  runId: string,
  critique: DesignCritique
): AgentEvent => ({
  type: 'artifact',
  data: {
    runId,
    kind: DESIGN_CRITIQUE_ARTIFACT_KIND,
    ref: JSON.stringify(critique),
  },
});
