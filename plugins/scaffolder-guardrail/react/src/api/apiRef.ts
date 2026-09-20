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
import type { AiRunEvent, ApprovalDecision, EvaluateRequestInput } from '../@types';

/** Typed API for advisory guardrail evaluation, replay, and resolution. */
export interface ScaffolderGuardrailApi {
  /** Starts an advisory guardrail assessment for a template request and streams back the execution events. */
  evaluateRequest(input: EvaluateRequestInput): AsyncGenerator<AiRunEvent>;

  /** Streams historical execution events, optionally restarting after an explicit event checkpoint index. */
  streamRunEvents(runId: string, lastEventId?: number): AsyncGenerator<AiRunEvent>;

  /** Submits an approval or rejection response for a pending parameters negotiation request. */
  submitApproval(runId: string, decision: ApprovalDecision): AsyncGenerator<AiRunEvent>;
}

/** Backstage API ref consumed by the guardrail review hook. */
export const scaffolderGuardrailApiRef = createApiRef<ScaffolderGuardrailApi>({
  id: 'plugin.scaffolder-ai-guardrail-agent.api'
});
