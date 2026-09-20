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
import { describe, expect, it } from 'vitest';
import { initialReleaseNotesRunState, reduceReleaseNotesRun } from '../hooks/useReleaseNotesRun';

const draft = {
  repoUrl: 'https://github.com/acme/app',
  targetVersion: 'v1.0.0',
  window: {},
  status: 'drafted' as const,
  sections: [],
  markdown: '',
  includedChanges: [],
  filteredCount: 1,
  limitations: [],
};

describe('reduceReleaseNotesRun', () => {
  /**
   * Assures that when evaluating an event trace historical stream, the reducer accurately
   * extracts the raw draft artifact and settles on a completed lifecycle state.
   */
  it('reconstructs a replayed draft artifact and completes', () => {
    let state = reduceReleaseNotesRun(initialReleaseNotesRunState, {
      type: 'artifact',
      data: {
        runId: 'run-1',
        kind: 'release-notes-draft',
        ref: JSON.stringify(draft),
      },
    });

    state = reduceReleaseNotesRun(state, {
      type: 'done',
      data: { runId: 'run-1' },
    });

    expect(state).toMatchObject({
      phase: 'finished',
      runId: 'run-1',
      draft,
    });
  });

  /**
   * Validates that receipt of an approval request pauses the state machine execution phase
   * and populates the approval security payload for UI tracking.
   */
  it('tracks an approval request for a future publish-enabled workflow', () => {
    const state = reduceReleaseNotesRun(initialReleaseNotesRunState, {
      type: 'approval_request',
      data: {
        runId: 'run-1',
        approvalId: 'approval-1',
        reason: 'Publish release',
        effect: 'write',
      },
    });

    expect(state).toMatchObject({
      phase: 'waiting_approval',
      approval: { approvalId: 'approval-1' },
    });
  });
});
