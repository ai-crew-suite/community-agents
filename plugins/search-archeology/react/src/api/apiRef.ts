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
import type { AiRunEvent, StartArcheologyInput } from '../@types';

/** Typed browser API for starting and replaying read-only archeology research. */
export interface SearchArcheologyApi {
  startResearch(input: StartArcheologyInput): AsyncGenerator<AiRunEvent>;
  streamRunEvents(runId: string): AsyncGenerator<AiRunEvent>;
}

/** Backstage API ref used by the archeology research hook. */
export const searchArcheologyApiRef = createApiRef<SearchArcheologyApi>({
  id: 'plugin.search-ai-archeology.api',
});
