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
import type { AiRunEvent, ApprovalDecision, ReleaseNotesRequest } from '../@types';

/** Typed browser API for release draft generation, replay, and future publish approval. */
export interface ReleaseNotesApi {
  /** Starts a draft-only release-notes run for one repository and target version. */
  generate(input: Omit<ReleaseNotesRequest, 'version' | 'source'>): AsyncGenerator<AiRunEvent>;
  /** Replays a persisted run event stream after an optional sequence checkpoint. */
  streamRunEvents(runId: string, lastEventId?: number): AsyncGenerator<AiRunEvent>;
  /** Submits a human approval decision and streams events from the resumed run. */
  submitApproval(runId: string, decision: ApprovalDecision): AsyncGenerator<AiRunEvent>;
}

/** Backstage API ref for consuming the release-notes client. */
export const releaseNotesApiRef = createApiRef<ReleaseNotesApi>({ id: 'plugin.release-notes-ai-generator.api' });
