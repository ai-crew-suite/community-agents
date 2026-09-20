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
import type { AiRunEvent, ApprovalDecision, EvaluateAlertInput } from '../@types';

/** Typed browser API for alert tuning evaluation, replay, and future approval. */
export interface AlertTunerApi {
  /** Starts one bounded tuning evaluation and streams its AI Core events. */
  evaluateAlert(input: EvaluateAlertInput): AsyncGenerator<AiRunEvent>;

  /** Replays persisted events, optionally continuing after an SSE event checkpoint. */
  streamRunEvents(runId: string, lastEventId?: number): AsyncGenerator<AiRunEvent>;

  /** Submits a future pending publication approval and streams the resumed run. */
  submitApproval(runId: string, decision: ApprovalDecision): AsyncGenerator<AiRunEvent>;
}

/** Backstage API ref used by `useAlertTuningRun`. */
export const alertTunerApiRef = createApiRef<AlertTunerApi>({
  id: 'plugin.alert-ai-tuner.api'
});
