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
  initialIntentProposalRunState,
  reduceIntentProposalRun,
} from '../useIntentProposalRun';

describe('reduceIntentProposalRun', () => {
  it('accepts a valid proposal and ignores malformed artifact JSON', () => {
    const valid = reduceIntentProposalRun(initialIntentProposalRunState, {
      type: 'artifact',
      data: {
        runId: 'run-1',
        kind: 'template-intent-proposal',
        ref: JSON.stringify({
          utterance: 'Create a react app',
          sessionId: 'run-1',
          status: 'proposed',
          candidates: [],
          confidence: 'high',
          parameters: [],
          issues: [],
          turns: 0,
          limitations: [],
          evidence: [],
        }),
      },
    });

    expect(valid.proposal?.status).toBe('proposed');

    const malformed = reduceIntentProposalRun(valid, {
      type: 'artifact',
      data: { runId: 'run-1', kind: 'template-intent-proposal', ref: '{' },
    });

    expect(malformed.proposal?.status).toBe('proposed');
  });
});
