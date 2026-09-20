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
  initialImpactAssessmentRunState,
  reduceImpactAssessmentRun,
} from '../useImpactAssessmentRun';

describe('reduceImpactAssessmentRun', () => {
  it('retains a valid impact artifact and ignores malformed artifact JSON', () => {
    const valid = reduceImpactAssessmentRun(initialImpactAssessmentRunState, {
      type: 'artifact',
      data: {
        runId: 'run-1',
        kind: 'impact-assessment',
        ref: JSON.stringify({
          entityRef: 'component:default/api',
          change: { kind: 'endpoint_removed', symbol: '/v1/charge' },
          status: 'complete',
          graphTruncated: false,
          consumers: [],
          counts: { impacted: 0, unaffected: 0, unknown: 0 },
          ownerRollups: [],
          limitations: [],
        }),
      },
    });

    expect(valid.assessment?.entityRef).toBe('component:default/api');

    const malformed = reduceImpactAssessmentRun(valid, {
      type: 'artifact',
      data: { runId: 'run-1', kind: 'impact-assessment', ref: '{' },
    });

    expect(malformed.assessment?.entityRef).toBe('component:default/api');
  });
});
