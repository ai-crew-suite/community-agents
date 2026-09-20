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
  initialRadarAnalysisRunState,
  RADAR_ANALYSIS_ARTIFACT,
  reduceRadarAnalysisRun,
} from '../useRadarAnalysisRun';

describe('reduceRadarAnalysisRun', () => {
  it('extracts a known radar analysis artifact', () => {
    const analysis = {
      radarSource: 'https://example.test/radar.json',
      scannedAt: '2026-01-01T00:00:00.000Z',
      coverage: { scanned: 1, unavailable: 0, failed: 0, total: 1 },
      metrics: [],
      proposals: [],
      deprecations: [],
      duplicateCapabilities: [],
      executiveSummary: 'No proposals.',
      status: 'analysis_only',
      limitations: [],
      evidence: [],
    } as const;

    expect(
      reduceRadarAnalysisRun(initialRadarAnalysisRunState, {
        type: 'artifact',
        data: {
          runId: 'run-1',
          kind: RADAR_ANALYSIS_ARTIFACT,
          ref: JSON.stringify(analysis),
        },
      }),
    ).toMatchObject({ runId: 'run-1', analysis });
  });

  it('ignores malformed artifact JSON', () => {
    expect(
      reduceRadarAnalysisRun(initialRadarAnalysisRunState, {
        type: 'artifact',
        data: { runId: 'run-1', kind: RADAR_ANALYSIS_ARTIFACT, ref: '{' },
      }).analysis,
    ).toBeUndefined();
  });
});
