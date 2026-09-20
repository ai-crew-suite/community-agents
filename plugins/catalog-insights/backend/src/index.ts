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
export { catalogAiInsightsModule as default } from './module';
export {
  createCatalogAiInsightsAgent,
  CATALOG_AI_INSIGHTS_AGENT_ID,
  CATALOG_AI_INSIGHTS_TOOL_IDS,
  CATALOG_AI_INSIGHTS_SYSTEM_PROMPT,
} from './agent';
export {
  readCatalogAiInsightsConfig,
  type CatalogAiInsightsConfig,
} from './config';
export {
  CatalogInsightsGraph,
  CATALOG_INSIGHTS_WORKFLOW_ID,
  type CatalogInsightsGraphOptions,
} from './workflow/CatalogInsightsGraph';
export { classifyIntent, INTENT_TOOL_PLANS } from './workflow/intents';
export type { IntentToolPlan } from './workflow/intents';
export {
  normalizeContext,
  redactSensitiveText,
  type RawContextItem,
} from './workflow/context';
export {
  buildCatalogInsightReport,
  buildDeterministicAnswer,
  parseModelInsight,
  type ModelInsightSynthesis,
} from './workflow/insight';
export {
  InsightRequestValidationError,
  normalizeInsightRequest,
  parseInsightQuery,
} from './workflow/request';
export { gatherForIntent } from './workflow/gather';
export { InsightRetriever } from './retrieval/InsightRetriever';
export { buildInsightPrompt } from './retrieval/promptContext';
export { InsightToolRunner } from './services/InsightToolRunner';
export {
  CatalogContextResolver,
  type CatalogClientLike,
} from './services/CatalogContextResolver';
export {
  createInsightReportArtifactEvent,
  CATALOG_INSIGHT_REPORT_ARTIFACT_KIND,
} from './services/InsightArtifactWriter';
export { planScan, SCAN_PROBE_QUESTION } from './scheduler/scanPlanner';
export {
  registerNightlyScanTask,
  NIGHTLY_SCAN_TASK_ID,
} from './scheduler/nightlyScan';
export type {
  CatalogInsightRequest,
  CatalogInsightReport,
  ContextItem,
  InsightIntent,
  InsightRunState,
} from './workflow/state';
