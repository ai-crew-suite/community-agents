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
import type { CatalogInsightReport } from '../workflow/state';

/** Artifact kind emitted for a completed catalog insight report. */
export const CATALOG_INSIGHT_REPORT_ARTIFACT_KIND = 'catalog-insight-report';

/**
 * Builds the `artifact` run event carrying the serialized insight report.
 * AI Core's runtime stores persist and replay the artifact; the frontend
 * reconstructs the report from the event payload.
 */
export const createInsightReportArtifactEvent = (
  runId: string,
  report: CatalogInsightReport,
): AgentEvent => ({
  type: 'artifact',
  data: {
    runId,
    kind: CATALOG_INSIGHT_REPORT_ARTIFACT_KIND,
    ref: JSON.stringify(report),
  },
});
