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
import { TunerToolRunner } from '../TunerToolRunner';
import type { WorkflowContext } from '@ai-crew-suite/plugin-kernel-node';

const createMockContext = (invokeToolMock: Function) => {
  const warn = vi.fn();
  return {
    context: {
      invokeTool: invokeToolMock,
      logger: { warn, info: vi.fn(), error: vi.fn() },
    } as unknown as WorkflowContext,
    warn,
  };
};

describe('TunerToolRunner Circuit Boundary Verification', () => {
  const testTool = 'vcs.repository.read_file';
  const testArgs = { path: 'alert.tf' };

  it('successfully invokes allow-listed tools within constraints and passes back typed tokens', async () => {
    const mockOutput = { toolId: testTool, output: 'hcl_data', summary: 'ok' };
    const invokeMock = vi.fn().mockResolvedValue(mockOutput);
    const { context } = createMockContext(invokeMock);

    const runner = new TunerToolRunner(context, { maxInvocations: 2, timeoutMs: 5000 });
    const result = await runner.invoke(testTool, testArgs);

    expect(result).toEqual(mockOutput);
    expect(invokeMock).toHaveBeenCalledWith({
      toolId: testTool,
      args: testArgs,
      limits: { timeoutMs: 5000 },
    });
    expect(runner.limitations).toHaveLength(0);
    expect(runner.missing(testTool)).toBe(false);
  });

  it('enforces localized fallback timeout configurations if options ignore them', async () => {
    const invokeMock = vi.fn().mockResolvedValue({ output: {} });
    const { context } = createMockContext(invokeMock);

    const runner = new TunerToolRunner(context, { maxInvocations: 5 }); // No timeoutMs supplied
    await runner.invoke(testTool, testArgs);

    expect(invokeMock).toHaveBeenCalledWith({
      toolId: testTool,
      args: testArgs,
      limits: { timeoutMs: 10000 }, // Confirms 10_000ms company-wide standard protection
    });
  });

  it('safely traps tool execution errors, records a limitation, and logs to the platform', async () => {
    const invokeMock = vi.fn().mockRejectedValue(new Error('Network connection reset by peer'));
    const { context, warn } = createMockContext(invokeMock);

    const runner = new TunerToolRunner(context, { maxInvocations: 3 });
    const result = await runner.invoke(testTool, testArgs);

    expect(result).toBeUndefined(); // Verifies it returns undefined instead of crashing the process
    expect(runner.missing(testTool)).toBe(true);
    expect(runner.limitations).toContain("Tool 'vcs.repository.read_file' is unavailable: Network connection reset by peer");
    expect(warn).toHaveBeenCalledWith("Alert tuning tool 'vcs.repository.read_file' failed", {
      error: 'Network connection reset by peer',
    });
  });

  it('caps invocation loops when the global run budget is exhausted and returns skipped entries', async () => {
    const invokeMock = vi.fn().mockResolvedValue({ output: {} });
    const { context } = createMockContext(invokeMock);

    // Hard limit budget cap set strictly to 2 calls max
    const runner = new TunerToolRunner(context, { maxInvocations: 2 });

    await runner.invoke('tool-1', {});
    await runner.invoke('tool-2', {});

    // The 3rd execution triggers an automatic circuit breaker truncation block
    const thirdResult = await runner.invoke('tool-3', {});

    expect(thirdResult).toBeUndefined();
    expect(invokeMock).toHaveBeenCalledTimes(2); // Only 2 hits ever traveled to downstream drivers
    expect(runner.missing('tool-3')).toBe(true);
    expect(runner.limitations).toContain(
      "Tool 'tool-3' was skipped: alert tuning tool budget exhausted."
    );
  });
});
