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
import type { AiRunEvent, StartRadarScanInput } from '../@types';

/** Typed browser API for scoped radar analysis and persisted-event replay. */
export interface TechRadarApi {
  startAnalysis(input: StartRadarScanInput): AsyncGenerator<AiRunEvent>;
  streamRunEvents(runId: string): AsyncGenerator<AiRunEvent>;
}

/** Backstage API reference used by radar analysis state. */
export const techRadarApiRef = createApiRef<TechRadarApi>({
  id: 'plugin.tech-radar-ai-manager.api',
});
