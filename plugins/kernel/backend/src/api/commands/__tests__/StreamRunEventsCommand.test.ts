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
// plugins/kernel/backend/src/api/commands/__tests__/StreamRunEventsCommand.test.ts
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { InputError, NotAllowedError, NotFoundError } from '@backstage/errors';
import { BackstageCredentials } from '@backstage/backend-plugin-api';
import { RunStore } from '@ai-crew-suite/plugin-kernel-node';
import { StreamRunEventsCommand } from '../StreamRunEventsCommand';
import { CommandContext, PackedRequestInput, FlushingResponse } from '../types';
import { EventEmitter } from 'events';

describe('StreamRunEventsCommand - Live Event Stream Pipeline Gateway Suite', () => {
  let mockLogger: any;
  let mockPermissions: any;
  let mockAgentRuntime: any;
  let mockRunStore: any;
  let mockContext: CommandContext;
  let mockCredentials: BackstageCredentials;
  let mockResponse: any;
  let defaultInput: PackedRequestInput;
  let mockReqEmitter: EventEmitter;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers(); // Enforces strict, deterministic validation over heartbeat intervals

    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };

    mockPermissions = {
      authorize: vi.fn().mockResolvedValue([{ result: 'ALLOW' }]),
    };

    mockRunStore = {
      getRun: vi.fn().mockResolvedValue({
        id: 'run_123',
        agentId: 'test-agent',
        status: 'initialized',
        actorIdentity: 'user:default/kevin',
        createdAt: new Date().toISOString(),
      }),
    };

    mockAgentRuntime = {
      run: vi.fn().mockImplementation(async function* () {
        yield { type: 'token', data: { text: 'Hello' } };
        yield { type: 'token', data: { text: ' World' } };
      }),
    };

    mockContext = {
      actorIdentity: 'user:default/authorized-developer',
      createdAt: new Date().toISOString(),
      logger: mockLogger,
    };

    mockCredentials = {} as unknown as BackstageCredentials;

    mockReqEmitter = new EventEmitter();

    mockResponse = {
      writeHead: vi.fn(),
      write: vi.fn().mockReturnValue(true),
      flush: vi.fn(),
      once: vi.fn(),
      end: vi.fn(),
      req: mockReqEmitter,
    };

    defaultInput = {
      params: { id: 'run_123' },
      query: { agentId: 'test-agent', query: 'Process tokens', source: 'all' },
      body: {},
      headers: { 'last-event-id': '42' },
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should immediately raise an InputError if path variables fail schema validation contracts', async () => {
    const command = new StreamRunEventsCommand(
      mockPermissions,
      mockAgentRuntime,
      mockRunStore as RunStore,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      {},
      mockCredentials
    );

    const brokenInput: PackedRequestInput = {
      ...defaultInput,
      params: { id: '' },
    };

    await expect(command.execute(brokenInput, mockContext)).rejects.toThrow(InputError);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('SSE Stream Initialization Dropped'),
      expect.any(Object)
    );
  });

  it('should throw a NotFoundError if the requested runId cannot be located inside the data store (IDOR Guard)', async () => {
    const command = new StreamRunEventsCommand(
      mockPermissions,
      mockAgentRuntime,
      mockRunStore as RunStore,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      {},
      mockCredentials
    );

    mockRunStore.getRun.mockResolvedValue(undefined);

    const unmappedInput: PackedRequestInput = {
      ...defaultInput,
      params: { id: 'run_unmapped_ghost_token' },
    };

    await expect(command.execute(unmappedInput, mockContext)).rejects.toThrow(NotFoundError);
    expect(mockAgentRuntime.run).not.toHaveBeenCalled();
  });

  it('should pass immediate modern Backstage NotAllowedErrors to middleware if run read scoping criteria checks drop', async () => {
    mockPermissions.authorize.mockResolvedValue([{ result: 'DENY' }]);
    const command = new StreamRunEventsCommand(
      mockPermissions,
      mockAgentRuntime,
      mockRunStore as RunStore,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      {},
      mockCredentials
    );

    await expect(command.execute(defaultInput, mockContext)).rejects.toThrow(NotAllowedError);
    expect(mockAgentRuntime.run).not.toHaveBeenCalled();
  });

  it('should process HTTP reconnection headers, stream tokens cleanly, and issue a native end execution signal', async () => {
    const command = new StreamRunEventsCommand(
      mockPermissions,
      mockAgentRuntime,
      mockRunStore as RunStore,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      {},
      mockCredentials
    );

    const streamFunction = await command.execute(defaultInput, mockContext);
    await streamFunction(mockResponse as FlushingResponse);

    expect(mockResponse.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({
      'Content-Type': 'text/event-stream',
      'Connection': 'keep-alive',
    }));
    expect(mockResponse.write).toHaveBeenCalledWith(expect.stringContaining('event: token'));
    expect(mockResponse.end).toHaveBeenCalled();
  });

  it('should verify that proxy buffer flushes execute on every text segment generation iteration', async () => {
    const command = new StreamRunEventsCommand(
      mockPermissions,
      mockAgentRuntime,
      mockRunStore as RunStore,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      {},
      mockCredentials
    );

    const streamFunction = await command.execute(defaultInput, mockContext);
    await streamFunction(mockResponse as FlushingResponse);

    // Two token events + headers allocation updates means flush must run to force proxy data egress
    expect(mockResponse.flush).toHaveBeenCalled();
    expect(mockResponse.flush).toHaveBeenCalledTimes(2);
  });

  it('should emit proxy heartbeats periodically on configured intervals and clear them safely upon stream completion', async () => {
    vi.useFakeTimers();
    const command = new StreamRunEventsCommand(
      mockPermissions,
      mockAgentRuntime,
      mockRunStore as RunStore,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      {},
      mockCredentials
    );

    const spyClearInterval = vi.spyOn(global, 'clearInterval');

    // Setup a clean, static promise hanger to keep the generator open without looping
    let resolveStream: (() => void) | undefined = undefined;

    const streamHanger = new Promise<void>(resolve => {
      resolveStream = resolve;
    });

    mockAgentRuntime.run.mockImplementation(async function* () {
      yield { type: 'token', data: {} };
      await streamHanger; // Hangs the stream cleanly without scheduling macro-tasks
    });

    const streamFunction = await command.execute(defaultInput, mockContext);
    const streamPromise = streamFunction(mockResponse as FlushingResponse);

    // Fast-forward virtual time past the 15-second checkpoint instantly
    await vi.advanceTimersByTimeAsync(15000);
    expect(mockResponse.write).toHaveBeenCalledWith(': keep-alive heartbeat\n\n');

    // Trigger immediate clean termination sequence
    mockReqEmitter.emit('close');
    if (resolveStream) {
      (resolveStream as () => void)();
    }

    await streamPromise;

    expect(spyClearInterval).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('should fall back safely to a zero sequence index if the client sends a malformed Last-Event-ID', async () => {
    const command = new StreamRunEventsCommand(
      mockPermissions,
      mockAgentRuntime,
      mockRunStore as RunStore,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      {},
      mockCredentials
    );

    const corruptInput: PackedRequestInput = { ...defaultInput, headers: { 'last-event-id': '99_corrupt_overflow_token' } };

    const streamFunction = await command.execute(corruptInput, mockContext);
    await streamFunction(mockResponse as FlushingResponse);

    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('Established live Server-Sent Events tracking pipeline channel context'),
      expect.objectContaining({ resumedFromSequence: 0 })
    );
  });

  it('should engage an explicit AbortSignal and terminate underlying engine streaming if the network container closes prematurely', async () => {
    const command = new StreamRunEventsCommand(
      mockPermissions,
      mockAgentRuntime,
      mockRunStore as RunStore,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      {},
      mockCredentials
    );

    mockAgentRuntime.run.mockImplementation(async function* () {
      yield { type: 'token', data: { text: 'First slice' } };
      mockReqEmitter.emit('close'); // Client abruptly cuts off socket pipeline context
      yield { type: 'token', data: { text: 'Dangling untracked token slice' } };
    });

    const streamFunction = await command.execute(defaultInput, mockContext);
    await streamFunction(mockResponse as FlushingResponse);

    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('Terminating event stream response channel bounds'),
      expect.objectContaining({ runId: 'run_123', abortedByClient: true })
    );
  });

  it('should respect network backpressure by pausing the event stream loop until a drain event is emitted', async () => {
    // Force real timers so asynchronous macros and event loops coordinate without timeout blocks
    vi.useRealTimers();
    const command = new StreamRunEventsCommand(
      mockPermissions,
      mockAgentRuntime,
      mockRunStore as RunStore,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      {},
      mockCredentials
    );

    mockResponse.write
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false); // Triggers network buffer backpressure

    mockResponse.once.mockImplementation((event: string, callback: () => void) => {
      if (event === 'drain') {
        setImmediate(callback);
      }
    });

    const streamFunction = await command.execute(defaultInput, mockContext);
    await streamFunction(mockResponse as FlushingResponse);

    expect(mockResponse.once).toHaveBeenCalledWith('drain', expect.any(Function));
    expect(mockResponse.end).toHaveBeenCalled();
  });


  it('should inject a safe error token and terminate the response cleanly if the generator crashes mid-stream', async () => {
    const command = new StreamRunEventsCommand(
      mockPermissions, mockAgentRuntime,
      mockRunStore as RunStore,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      {},
      mockCredentials
    );

    mockAgentRuntime.run.mockImplementation(async function*() {
      throw new Error('Vector engine socket disconnected or timed out mid-iteration');
    });

    const streamFunction = await command.execute(defaultInput, mockContext);

    await streamFunction(mockResponse as FlushingResponse);

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Stream execution failed or was severed prematurely on tracking node'),
      expect.objectContaining({
        runId: 'run_123',
        errorMessage: 'Vector engine socket disconnected or timed out mid-iteration'
      })
    );
    expect(mockResponse.write).toHaveBeenCalledWith(expect.stringContaining('event: error'));
    expect(mockResponse.end).toHaveBeenCalled();
  });
});
