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
import { initialShadowScanState, reduceShadowScan } from '../useShadowScan';

describe('reduceShadowScan', () => {
  it('retains valid reports and ignores malformed artifacts', () => {
    const valid = reduceShadowScan(initialShadowScanState, {
      type: 'artifact',
      data: {
        runId: 'run-1',
        kind: 'shadow-resource-report',
        ref: JSON.stringify({
          providers: [],
          scanned: 0,
          registered: 0,
          orphans: [],
          suppressedCount: 0,
          status: 'no_orphans',
          limitations: [],
          evidence: [],
        }),
      },
    });

    expect(valid.report?.status).toBe('no_orphans');

    expect(
      reduceShadowScan(valid, {
        type: 'artifact',
        data: { runId: 'run-1', kind: 'shadow-resource-report', ref: '{' },
      }).report?.status,
    ).toBe('no_orphans');
  });
});
