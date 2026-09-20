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
  initialDebtScoutRunState,
  reduceDebtScoutRun,
  TECH_DEBT_REPORT_ARTIFACT,
} from '../useDebtScoutRun';

describe('reduceDebtScoutRun', () => {
  it('extracts the known technical-debt report artifact', () => {
    const report = {
      scannedAt: '2026-01-01T00:00:00.000Z',
      targets: [],
      findings: [],
      counts: { escalate: 0, suppressed: 0, alreadyTracked: 0 },
      bySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
      byOwner: [],
      status: 'no_findings',
      limitations: [],
      evidence: [],
    } as const;

    const next = reduceDebtScoutRun(initialDebtScoutRunState, {
      type: 'artifact',
      data: {
        runId: 'run-1',
        kind: TECH_DEBT_REPORT_ARTIFACT,
        ref: JSON.stringify(report),
      },
    });

    expect(next).toMatchObject({ runId: 'run-1', report });
  });

  it('does not trust malformed artifact JSON', () => {
    const next = reduceDebtScoutRun(initialDebtScoutRunState, {
      type: 'artifact',
      data: { runId: 'run-1', kind: TECH_DEBT_REPORT_ARTIFACT, ref: '{' },
    });

    expect(next.runId).toBe('run-1');
    expect(next.report).toBeUndefined();
  });
});
