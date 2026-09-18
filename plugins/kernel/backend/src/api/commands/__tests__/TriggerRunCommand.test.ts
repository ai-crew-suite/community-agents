/**
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
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InputError, NotAllowedError, NotImplementedError } from '@backstage/errors';
import { BackstageCredentials } from '@backstage/backend-plugin-api';
import { TriggerRunCommand, AgentRuntimeEngine } from '../TriggerRunCommand';
import { CommandContext, PackedRequestInput } from '../types/shared';
import { TriggerBinding } from '@ai-crew-suite/plugin-kernel-node';

describe('TriggerRunCommand - Automated Infrastructure Event Processing Gateway Suite', () => {
  let mockLogger: any;
  let mockPermissions: any;
  let mockRuntime: AgentRuntimeEngine;
  let mockContext: CommandContext;
  let mockCredentials: BackstageCredentials;
  let mockTriggersList: TriggerBinding[];
  let mockAgentsMap: Map<string, unknown>;
  let defaultInput: PackedRequestInput;

  beforeEach(() => {
    vi.clearAllMocks();

    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };

    mockPermissions = {
      authorize: vi.fn().mockResolvedValue([{ result: 'ALLOW' }]),
    };

    mockRuntime = {
      run: vi.fn().mockImplementation(async function* () {
        yield { type: 'step', data: { phase: 'enter' } };
      }),
    };

    mockTriggersList = [
      { id: 'cron-hourly-sync', source: 'backstage-timer', agentId: 'compliance-agent' },
    ];

    mockAgentsMap = new Map([['compliance-agent', { id: 'compliance-agent' }]]);

    mockContext = {
      actorIdentity: 'system:service-principal/cron-scheduler',
      createdAt: new Date().toISOString(),
      logger: mockLogger,
    };

    mockCredentials = {} as unknown as BackstageCredentials;

    defaultInput = {
      params: { source: 'backstage-timer' },
      body: { triggerId: 'cron-hourly-sync', query: 'Audit database tables execution schemas' },
      query: {},
      headers: { authorization: 'Bearer system-token' },
    };
  });

  it('should immediately raise a NotImplementedError if a core sub-system registry is missing', async () => {
    const command = new TriggerRunCommand(mockPermissions, undefined, mockTriggersList, mockAgentsMap, {}, mockCredentials);
    await expect(command.execute(defaultInput, mockContext)).rejects.toThrow(NotImplementedError);
  });

  it('should instantly throw an InputError if incoming parameters fail parsing criteria checks', async () => {
    const command = new TriggerRunCommand(mockPermissions, mockRuntime, mockTriggersList, mockAgentsMap, {}, mockCredentials);

    const brokenInput: PackedRequestInput = {
      ...defaultInput,
      params: { source: '' },
      body: {},
    };

    await expect(command.execute(brokenInput, mockContext)).rejects.toThrow(InputError);

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Infrastructure Validation Drop'),
      expect.any(Object)
    );
  });

  it('should throw an explicit InputError if no configured trigger matches parameter keys', async () => {
    const command = new TriggerRunCommand(mockPermissions, mockRuntime, mockTriggersList, mockAgentsMap, {}, mockCredentials);

    const unmappedInput: PackedRequestInput = {
      ...defaultInput,
      params: { source: 'unregistered-source-ref' },
      body: { triggerId: 'unmapped-id-token', query: 'Execute checks' },
    };

    await expect(command.execute(unmappedInput, mockContext)).rejects.toThrow(InputError);
  });

  it('should pass type validations, link the verified service principal, and yield an accepted receipt status', async () => {
    const command = new TriggerRunCommand(mockPermissions, mockRuntime, mockTriggersList, mockAgentsMap, {}, mockCredentials);

    const result = await command.execute(defaultInput, mockContext);

    expect(result.status).toBe('trigger_processing_dispatched');
    expect(result.runId).toBeDefined();

    expect(mockRuntime.run).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: 'compliance-agent', trigger: 'cron-hourly-sync' }),
      expect.objectContaining({ identity: 'system:service-principal/cron-scheduler' })
    );
  });

  it('should capture fatal async generator rejections inside the background closure and log deep stack traces', async () => {
    const command = new TriggerRunCommand(mockPermissions, mockRuntime, mockTriggersList, mockAgentsMap, {}, mockCredentials);

    vi.mocked(mockRuntime.run).mockImplementationOnce(() => {
      const complexError = new Error('Critical file partition missing or database transaction closed');
      complexError.name = 'SystemPartitionFailureException';
      complexError.stack = 'Error: Critical file partition missing\n    at RunEngine.run (engine.ts:42:11)';
      throw complexError;
    });

    const result = await command.execute(defaultInput, mockContext);

    expect(result.status).toBe('trigger_processing_dispatched');

    // Allow microtasks queue loop to clear so the detached async background block executes completely
    await new Promise(resolve => setImmediate(resolve));

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Fatal background loop system processing crack encountered on automated run tracker'),
      expect.objectContaining({
        triggerId: 'cron-hourly-sync',
        userRef: 'system:service-principal/cron-scheduler',
        errorName: 'SystemPartitionFailureException',
        errorMessage: 'Critical file partition missing or database transaction closed',
        errorStack: expect.stringContaining('at RunEngine.run'),
      })
    );
  });

  it('should catch a Ghost Agent reference, halt execution loops, and throw an InputError', async () => {
    const emptyAgentsMap = new Map<string, unknown>();
    const command = new TriggerRunCommand(mockPermissions, mockRuntime, mockTriggersList, emptyAgentsMap, {}, mockCredentials);

    await expect(command.execute(defaultInput, mockContext)).rejects.toThrow(InputError);
    expect(mockRuntime.run).not.toHaveBeenCalled();
  });

  it('should safely intercept intermediate error tokens emitted inside the asynchronous event stream and log telemetry data', async () => {
    const command = new TriggerRunCommand(mockPermissions, mockRuntime, mockTriggersList, mockAgentsMap, {}, mockCredentials);

    vi.mocked(mockRuntime.run).mockImplementationOnce(async function* () {
      yield { type: 'step', data: { phase: 'enter' } };
      yield {
        type: 'error',
        data: { code: 'MODEL_RATE_LIMIT', message: '429 Token limit exhausted on external model provider', retryable: true },
      };
    });

    const result = await command.execute(defaultInput, mockContext);

    expect(result.status).toBe('trigger_processing_dispatched');

    // Allow microtasks queue loop to clear so the detached async background block executes completely
    await new Promise(resolve => setImmediate(resolve));

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Automated background run iteration reported engine failure'),
      expect.objectContaining({
        triggerId: 'cron-hourly-sync',
        userRef: 'system:service-principal/cron-scheduler',
        errorCode: 'MODEL_RATE_LIMIT',
        errorMessage: '429 Token limit exhausted on external model provider',
        retryable: true,
      })
    );
  });

  it('should throw an explicit system exception and log an error metric if the permissions service response payload is completely empty', async () => {
    mockPermissions.authorize.mockResolvedValue([]);
    const command = new TriggerRunCommand(mockPermissions, mockRuntime, mockTriggersList, mockAgentsMap, {}, mockCredentials);

    await expect(command.execute(defaultInput, mockContext)).rejects.toThrow(
      'Internal authorization parsing failure encountered'
    );

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('RBAC critical evaluation failure: Authorization response payload was completely empty')
    );
    expect(mockRuntime.run).not.toHaveBeenCalled();
  });

  it('should reject requests with a NotAllowedError if the service identity is explicitly denied by RBAC profiles', async () => {
    mockPermissions.authorize.mockResolvedValue([{ result: 'DENY' }]);
    const command = new TriggerRunCommand(mockPermissions, mockRuntime, mockTriggersList, mockAgentsMap, {}, mockCredentials);

    await expect(command.execute(defaultInput, mockContext)).rejects.toThrow(NotAllowedError);
    expect(mockRuntime.run).not.toHaveBeenCalled();
  });

  it('should reject requests with an InputError if the query parameter consists entirely of empty whitespace characters', async () => {
    const command = new TriggerRunCommand(mockPermissions, mockRuntime, mockTriggersList, mockAgentsMap, {}, mockCredentials);

    const emptyQueryInput: PackedRequestInput = {
      ...defaultInput,
      body: {
        triggerId: 'cron-hourly-sync',
        query: '   \n\t\r   ' // Whitespace constraint breach
      }
    };

    await expect(command.execute(emptyQueryInput, mockContext)).rejects.toThrow(InputError);
    expect(mockRuntime.run).not.toHaveBeenCalled();
  });

  it('should seamlessly merge user-defined hardening overrides while safely preserving remaining fallback options', async () => {
    const customHardening = {
      maxTotalTokens: 25000, // Custom strict budget limit override
      maxRetries: 5
    };

    const command = new TriggerRunCommand(
      mockPermissions,
      mockRuntime,
      mockTriggersList,
      mockAgentsMap,
      customHardening,
      mockCredentials
    );

    const result = await command.execute(defaultInput, mockContext);
    expect(result.status).toBe('trigger_processing_dispatched');

    // Verify that the custom override was merged natively alongside fallback timeout defaults
    expect(mockRuntime.run).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        hardening: expect.objectContaining({
          maxTotalTokens: 25000,   // Custom parameter respected
          maxRetries: 5,           // Custom parameter respected
          timeoutMs: 120000        // Preserved fallback default safety boundary
        })
      })
    );
  });

  it('should handle un-iterable or corrupt stream instances inside the background enclosure without crashing the worker process thread', async () => {
    const command = new TriggerRunCommand(mockPermissions, mockRuntime, mockTriggersList, mockAgentsMap, {}, mockCredentials);

    // Simulate the execution engine returning an invalid, non-iterable null stream block payload
    vi.mocked(mockRuntime.run).mockReturnValueOnce(null as any);

    const result = await command.execute(defaultInput, mockContext);

    // Verify the HTTP boundary still dispatches an acknowledgment cleanly
    expect(result.status).toBe('trigger_processing_dispatched');

    // Wait for macro-task pool drainage so the detached async loop resolves completely
    await new Promise(resolve => setImmediate(resolve));

    // Confirm that the background loop caught the streaming error and logged the stack trace safely
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Fatal background loop system processing crack encountered on automated run tracker'),
      expect.objectContaining({
        triggerId: 'cron-hourly-sync',
        userRef: 'system:service-principal/cron-scheduler'
      })
    );
  });
});
