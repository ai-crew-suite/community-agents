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
import type { AiRunEvent, StartDebtScanInput } from '../@types';

/** Typed browser API for starting and replaying technical-debt scan reports. */
export interface TechDebtScoutApi {
  startScan(input: StartDebtScanInput): AsyncGenerator<AiRunEvent>;
  streamRunEvents(runId: string): AsyncGenerator<AiRunEvent>;
}

/** Backstage API reference consumed by the debt scan hook. */
export const techDebtScoutApiRef = createApiRef<TechDebtScoutApi>({
  id: 'plugin.tech-debt-ai-scout.api',
});
