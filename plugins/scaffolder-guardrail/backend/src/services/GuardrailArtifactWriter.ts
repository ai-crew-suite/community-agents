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
import type { GuardrailAssessment, GuardrailResolution } from '../workflow/state';

/** Artifact kinds for deterministic assessments and negotiated resolutions. */
export const GUARDRAIL_ASSESSMENT_ARTIFACT = 'guardrail-assessment';
export const GUARDRAIL_RESOLUTION_ARTIFACT = 'guardrail-resolution';

/** Creates a replayable assessment artifact event. */
export const assessmentArtifact = (
  runId: string,
  assessment: GuardrailAssessment
): AgentEvent => ({
  type: 'artifact',
  data: {
    runId,
    kind: GUARDRAIL_ASSESSMENT_ARTIFACT,
    ref: JSON.stringify(assessment)
  }
});

/** Creates a replayable resolution artifact event. */
export const resolutionArtifact = (
  runId: string,
  resolution: GuardrailResolution
): AgentEvent => ({
  type: 'artifact',
  data: {
    runId,
    kind: GUARDRAIL_RESOLUTION_ARTIFACT,
    ref: JSON.stringify(resolution)
  }
});
