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
import type { AiRunEvent, ApprovalDecision, StartReviewInput } from '../@types';

/**
 * Typed browser API for RFC/ADR design review. Every operation streams AI Core
 * run events, so callers consume the returned async generator.
 */
export interface RfcAdrReviewerApi {
  /**
   * Starts a parallel design review for one RFC/ADR document and streams its
   * run events. The generated run ID appears in every event's `data.runId`,
   * enabling a deep link once the first event arrives.
   */
  startReview(input: StartReviewInput): AsyncGenerator<AiRunEvent>;
  /**
   * Replays persisted events for an existing run (deep-link or reload
   * recovery), optionally resuming after a `Last-Event-ID` sequence checkpoint.
   */
  streamRunEvents(
    runId: string,
    lastEventId?: number,
  ): AsyncGenerator<AiRunEvent>;
  /**
   * Submits a human approval decision for a suspended run and streams the
   * events produced by resuming it. Posting the critique to a pull request is
   * only ever attempted after an `approved` decision.
   */
  submitApproval(
    runId: string,
    decision: ApprovalDecision,
  ): AsyncGenerator<AiRunEvent>;
}

/** Backstage API ref for consuming `RfcAdrReviewerApi` via `useApi`. */
export const rfcAdrReviewerApiRef = createApiRef<RfcAdrReviewerApi>({
  id: 'plugin.rfc-adr-ai-reviewer.api',
});
