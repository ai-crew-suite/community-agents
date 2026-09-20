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
import { createApiRef } from '@backstage/core-plugin-api';
import type { AiRunEvent, AskInsightInput } from '../@types';

/**
 * Frontend API for catalog AI insights. Both operations stream AI Core run
 * events over server-sent events; callers consume the async generator.
 */
export interface CatalogAiInsightsApi {
  /**
   * Starts an insight run for one catalog entity and streams its run events.
   * The generated run ID appears in every event's `data.runId`, enabling a
   * deep link once the first event arrives. Pass the `sessionId` returned by
   * a previous run to continue the conversation with session memory.
   */
  askQuestion(input: AskInsightInput): AsyncGenerator<AiRunEvent>;
  /**
   * Replays persisted events for an existing run (deep-link/reload recovery),
   * optionally resuming after a `Last-Event-ID` sequence checkpoint.
   */
  streamRunEvents(
    runId: string,
    lastEventId?: number,
  ): AsyncGenerator<AiRunEvent>;
}

/** Backstage API ref for consuming `CatalogAiInsightsApi` via `useApi`. */
export const catalogAiInsightsApiRef = createApiRef<CatalogAiInsightsApi>({
  id: 'plugin.catalog-ai-insights.api',
});
