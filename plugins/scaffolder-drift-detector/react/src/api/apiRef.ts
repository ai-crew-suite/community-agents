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
import type { AiRunEvent, ApprovalDecision, CheckDriftInput } from '../@types';

/** Typed API for drift checks, replay, and future remediation approval. */
export interface DriftDetectorApi {
  checkDrift(input: CheckDriftInput): AsyncGenerator<AiRunEvent>;
  streamRunEvents(runId: string, lastEventId?: number): AsyncGenerator<AiRunEvent>;
  submitApproval(runId: string, decision: ApprovalDecision): AsyncGenerator<AiRunEvent>;
}

/** Backstage API ref consumed by the drift run hook. */
export const driftDetectorApiRef = createApiRef<DriftDetectorApi>({
  id: 'plugin.scaffolder-ai-drift-detector.api'
});
