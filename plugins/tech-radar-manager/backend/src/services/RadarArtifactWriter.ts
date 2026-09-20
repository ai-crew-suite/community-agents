/*
 * Copyright 2026 The AI Crew Suite Authors
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and limitations under the License.
 */
import type { AgentEvent } from '@ai-crew-suite/plugin-kernel-node';
import type { RadarAnalysis } from '../workflow/state';

/** Artifact kind emitted for deterministic radar analyses. */
export const RADAR_ANALYSIS_ARTIFACT = 'radar-analysis';

/** Creates the replayable serialized radar analysis event. */
export const radarAnalysisArtifact = (
  runId: string,
  analysis: RadarAnalysis,
): AgentEvent => ({
  type: 'artifact',
  data: { runId, kind: RADAR_ANALYSIS_ARTIFACT, ref: JSON.stringify(analysis) },
});
