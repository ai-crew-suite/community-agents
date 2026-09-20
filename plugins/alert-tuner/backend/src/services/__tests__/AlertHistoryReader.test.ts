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
import { describe, expect, it, vi } from 'vitest';
import { AlertHistoryReader, ALERT_HISTORY_TOOL_ID } from '../AlertHistoryReader';
import type { TunerToolRunner } from '../TunerToolRunner';
import type { AlertTuningRequest } from '../../workflow/state';

const createMockToolRunner = (mockOutput: unknown) => {
  const invoke = vi.fn().mockResolvedValue({
    toolId: ALERT_HISTORY_TOOL_ID,
    output: mockOutput,
    summary: 'Mock execution complete',
  });
  return {
    tools: { invoke } as unknown as TunerToolRunner,
    invoke,
  };
};

const mockRequest = {
  alertId: 'cpu_high',
  service: 'checkout',
} as AlertTuningRequest;

const mockWindow = {
  from: '2026-02-01T00:00:00.000Z',
  to: '2026-02-02T00:00:00.000Z',
};

describe('AlertHistoryReader Trust Boundary Verification', () => {
  it('correctly maps and forwards structural parameters to the underlying execution tool', async () => {
    const validRawEntries = [{ id: 'alert-1' }, { id: 'alert-2' }];
    const { tools, invoke } = createMockToolRunner(validRawEntries);
    const reader = new AlertHistoryReader(tools, 5);

    const result = await reader.read(mockRequest, mockWindow);

    expect(result).toHaveLength(2);
    expect(result).toEqual(validRawEntries);
    expect(invoke).toHaveBeenCalledWith(ALERT_HISTORY_TOOL_ID, {
      alertId: 'cpu_high',
      service: 'checkout',
      since: mockWindow.from,
      until: mockWindow.to,
      limit: 5,
    });
  });

  it('safely degrades to an empty array without throwing exceptions when the third-party schema format is completely broken', async () => {
    // Simulate a third-party driver returning an error envelope object literal instead of an array
    const corruptedResponse = { status: 'failure', message: 'Internal Server Error' };
    const { tools } = createMockToolRunner(corruptedResponse);
    const reader = new AlertHistoryReader(tools, 10);

    const result = await reader.read(mockRequest, mockWindow);

    // Verifies the trust boundary successfully shields the system from crashing on unexpected non-array shapes
    expect(result).toEqual([]);
    expect(() => reader.read(mockRequest, mockWindow)).not.toThrow();
  });

  it('filters out primitive values and null fragments to deliver a clean object list down-funnel', async () => {
    const messyPayload = [
      { id: 'valid-alert' },
      null,
      'malicious-string-injection',
      42,
      { id: 'another-valid-alert' }
    ];
    const { tools } = createMockToolRunner(messyPayload);
    const reader = new AlertHistoryReader(tools, 10);

    const result = await reader.read(mockRequest, mockWindow);

    expect(result).toHaveLength(2);
    expect(result).toEqual([{ id: 'valid-alert' }, { id: 'another-valid-alert' }]);
  });

  it('strictly applies hard array truncation limits if the raw integration output exceeds maximum allowed space requirements', async () => {
    const massivePayload = Array.from({ length: 100 }, (_, i) => ({ id: `alert-${i}` }));
    const { tools } = createMockToolRunner(massivePayload);
    const maxEntriesClamp = 3;
    const reader = new AlertHistoryReader(tools, maxEntriesClamp);

    const result = await reader.read(mockRequest, mockWindow);

    // Confirms it slices exactly at the maxEntries ceiling limit
    expect(result).toHaveLength(3);
    expect(result).toEqual([
      { id: 'alert-0' },
      { id: 'alert-1' },
      { id: 'alert-2' }
    ]);
  });
});
