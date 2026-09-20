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
export { catalogAiInsightsPlugin, CatalogInsightsPage } from './plugin';
export {
  catalogAiInsightsApiRef,
  CatalogAiInsightsClient,
  CATALOG_AI_INSIGHTS_AGENT_ID,
  type CatalogAiInsightsApi,
} from './api';
export {
  useInsightRun,
  reduceInsightRun,
  initialInsightRunState,
  CATALOG_INSIGHT_REPORT_ARTIFACT,
  type InsightRunPhase,
  type InsightRunState,
  type StepEvent,
  type ToolEvent,
} from './hooks/useInsightRun';
export {
  EntityInsightsCard,
  EntityContextInsightsCard,
  CANNED_QUESTIONS,
  AskInsightDialog,
  InsightRunView,
  AnswerPanel,
  ContextPanel,
  InsightStatusBanner,
  type AskInsightForm,
} from './components';
export { rootRouteRef, ROOT_PATH } from './routes';
export type {
  AiRunEvent,
  AskInsightInput,
  CatalogInsightReport,
  CatalogInsightRequest,
  ContextItem,
  ContextItemSource,
  InsightIntent,
} from './@types';
