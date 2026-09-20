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
import type { DebtReport } from '../workflow/state';

/** Artifact kind emitted for replayable deterministic debt reports. */
export const TECH_DEBT_REPORT_ARTIFACT = 'tech-debt-report';

/** Creates a serialized, cited technical-debt report artifact event. */
export const techDebtReportArtifact = (
  runId: string,
  report: DebtReport,
): AgentEvent => ({
  type: 'artifact',
  data: { runId, kind: TECH_DEBT_REPORT_ARTIFACT, ref: JSON.stringify(report) },
});
