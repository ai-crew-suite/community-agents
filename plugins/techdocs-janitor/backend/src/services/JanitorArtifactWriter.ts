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
import type { JanitorReport } from '../workflow/state';

/** Artifact kind for cited read-only TechDocs audits. */
export const JANITOR_REPORT_ARTIFACT = 'janitor-report';

/** Creates a replayable TechDocs audit artifact. */
export const janitorReportArtifact = (runId: string, report: JanitorReport): AgentEvent => ({
  type: 'artifact',
  data: { runId, kind: JANITOR_REPORT_ARTIFACT, ref: JSON.stringify(report) },
});
