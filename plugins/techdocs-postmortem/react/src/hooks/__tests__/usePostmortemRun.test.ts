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
import {
  initialPostmortemRunState,
  POSTMORTEM_DRAFT_ARTIFACT,
  reducePostmortemRun,
} from '../usePostmortemRun';

describe('reducePostmortemRun', () => {
  it('extracts known postmortem draft artifacts', () => {
    const draft = {
      incidentId: 'INC-1',
      title: 'Outage',
      status: 'draft_only',
      timeline: [],
      narrative: 'No root cause.',
      coverage: {
        incident: 'collected',
        alerts: 'empty',
        chat: 'unavailable',
        observability: 'unavailable',
        vcs: 'unavailable',
      },
      limitations: [],
    } as const;

    expect(
      reducePostmortemRun(initialPostmortemRunState, {
        type: 'artifact',
        data: {
          runId: 'run-1',
          kind: POSTMORTEM_DRAFT_ARTIFACT,
          ref: JSON.stringify(draft),
        },
      }),
    ).toMatchObject({ runId: 'run-1', draft });
  });

  it('ignores malformed JSON', () => {
    expect(
      reducePostmortemRun(initialPostmortemRunState, {
        type: 'artifact',
        data: { runId: 'run-1', kind: POSTMORTEM_DRAFT_ARTIFACT, ref: '{' },
      }).draft,
    ).toBeUndefined();
  });
});
