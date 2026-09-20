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
export { searchContextPlugin, ImpactPage } from './plugin';
export {
  SearchContextClient,
  searchContextApiRef,
  SEARCH_CONTEXT_AGENT_ID,
  type SearchContextApi,
} from './api';
export {
  useImpactAssessmentRun,
  reduceImpactAssessmentRun,
  initialImpactAssessmentRunState,
  IMPACT_ASSESSMENT_ARTIFACT,
  type ImpactAssessmentRunState,
} from './hooks/useImpactAssessmentRun';
export * from './components';
export { ROOT_PATH, rootRouteRef } from './routes';
export type * from './@types';
