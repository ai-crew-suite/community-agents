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
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InputError, NotAllowedError, NotImplementedError, ConflictError } from '@backstage/errors';
import { BackstageCredentials } from '@backstage/backend-plugin-api';
import { StartRunCommand } from '../StartRunCommand';
import { CommandContext, PackedRequestInput } from '../types';

describe('StartRunCommand - Orchestrated Workflow Initialization Domain Suite', () => {
  let mockLogger: any;
  let mockPermissions: any;
  let mockAgentsMap: Map<string, unknown>;
  let mockConsumeRateLimit: any;
  let mockRunStore: any;
  let mockContext: CommandContext;
  let mockCredentials: BackstageCredentials;
  let validRequestInput: PackedRequestInput;

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

    mockAgentsMap = new Map([['assistant-crew', { id: 'assistant-crew' }]]);

    mockConsumeRateLimit = vi.fn().mockReturnValue(true);

    mockRunStore = {
      createRun: vi.fn().mockResolvedValue(undefined),
    };

    mockContext = {
      actorIdentity: 'user:default/kevin',
      createdAt: new Date().toISOString(),
      logger: mockLogger,
    };

    mockCredentials = {} as unknown as BackstageCredentials;

    validRequestInput = {
      params: { id: 'assistant-crew' },
      query: {},
      body: { query: 'Execute system optimization checklist mappings' },
      headers: { authorization: 'Bearer test-token-profile' },
    };
  });

  it('should throw an unrecoverable system exception and log an error metric if the permissions service response payload is completely empty', async () => {
    mockPermissions.authorize.mockResolvedValue([]);
    const command = new StartRunCommand(mockPermissions, mockAgentsMap, mockConsumeRateLimit, mockRunStore, {}, mockCredentials);

    await expect(command.execute(validRequestInput, mockContext)).rejects.toThrow(
      'Internal authorization parsing failure encountered'
    );

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('RBAC critical evaluation failure: Authorization response payload was completely empty')
    );
  });

  it('should throw an explicit NotImplementedError if the core RunStore layer is unconfigured', async () => {
    // Inject undefined for the RunStore dependency parameter
    const command = new StartRunCommand(
      mockPermissions,
      mockAgentsMap,
      mockConsumeRateLimit,
      undefined, // Missing storage engine
      {},
      mockCredentials
    );

    await expect(command.execute(validRequestInput, mockContext)).rejects.toThrow(NotImplementedError);
    await expect(command.execute(validRequestInput, mockContext)).rejects.toThrow(
      'Run persistence storage engine is not configured or mounted on this AI backend kernel node.'
    );
  });

  it('should throw an explicit NotImplementedError if the rate-limiting callback engine is missing', async () => {
    // Inject undefined for the consumeRateLimit functional dependency callback parameter
    const command = new StartRunCommand(
      mockPermissions,
      mockAgentsMap,
      undefined as any, // Missing rate limiter callback boundary
      mockRunStore,
      {},
      mockCredentials
    );

    await expect(command.execute(validRequestInput, mockContext)).rejects.toThrow(NotImplementedError);
    await expect(command.execute(validRequestInput, mockContext)).rejects.toThrow(
      'Throttling and rate-limiting infrastructure boundaries are missing from this execution engine context.'
    );
  });

  it('should immediately raise an InputError if validation fields fail Zod parsing parameters', async () => {
    const command = new StartRunCommand(
      mockPermissions,
      mockAgentsMap,
      mockConsumeRateLimit,
      mockRunStore,
      {},
      mockCredentials
    );

    const brokenInput: PackedRequestInput = {
      ...validRequestInput,
      params: { id: '' },
      body: {},
    };

    await expect(command.execute(brokenInput, mockContext)).rejects.toThrow(InputError);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Run Initialization Dropped'),
      expect.any(Object)
    );
  });

  it('should throw an explicit InputError if the requested agentId is unmapped inside engine keys', async () => {
    const command = new StartRunCommand(
      mockPermissions,
      mockAgentsMap,
      mockConsumeRateLimit,
      mockRunStore,
      {},
      mockCredentials
    );

    const unmappedInput: PackedRequestInput = {
      ...validRequestInput,
      params: { id: 'ghost-agent-identifier-token' },
    };

    await expect(command.execute(unmappedInput, mockContext)).rejects.toThrow(InputError);
  });

  it('should raise a ConflictError if local rate limit token buckets evaluate as exhausted', async () => {
    mockConsumeRateLimit.mockReturnValue(false);
    const command = new StartRunCommand(
      mockPermissions,
      mockAgentsMap,
      mockConsumeRateLimit,
      mockRunStore,
      {},
      mockCredentials
    );

    await expect(command.execute(validRequestInput, mockContext)).rejects.toThrow(ConflictError);
    expect(mockRunStore.createRun).not.toHaveBeenCalled();
  });

  it('should verify structural elements, provision a durable ledger item, and acknowledge with an accepted receipt', async () => {
    const command = new StartRunCommand(
      mockPermissions,
      mockAgentsMap,
      mockConsumeRateLimit,
      mockRunStore,
      {},
      mockCredentials
    );

    const result = await command.execute(validRequestInput, mockContext);

    expect(result.status).toBe('accepted');
    expect(result.runId).toBeDefined();
    expect(mockRunStore.createRun).toHaveBeenCalledWith(expect.objectContaining({
      id: result.runId,
      agentId: 'assistant-crew',
      status: 'initialized',
      createdAt: expect.any(String),
    }));
  });

  it('should securely catch async database errors and mask raw cluster details from the client response', async () => {
    const command = new StartRunCommand(
      mockPermissions,
      mockAgentsMap,
      mockConsumeRateLimit,
      mockRunStore,
      {},
      mockCredentials
    );

    mockRunStore.createRun.mockRejectedValue(new Error('FATAL: pool connection timeout on node address 10.0.4.12'));

    await expect(command.execute(validRequestInput, mockContext)).rejects.toThrow(
      'An infrastructure exception blocked workflow thread execution provisioning channels.'
    );
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Critical Persistence Ledger Allocation Failure'),
      expect.objectContaining({
        agentId: 'assistant-crew',
        errorMessage: 'FATAL: pool connection timeout on node address 10.0.4.12',
      })
    );
  });

  it('should immediately reject request executions with a NotAllowedError if custom headers are completely missing during cookie Ingress tracks', async () => {
    const command = new StartRunCommand(
      mockPermissions,
      mockAgentsMap,
      mockConsumeRateLimit,
      mockRunStore,
      {},
      mockCredentials
    );

    const missingHeadersInput: PackedRequestInput = {
      ...validRequestInput,
      headers: { host: 'backstage.internal.net' },
    };

    await expect(command.execute(missingHeadersInput, mockContext)).rejects.toThrow(NotAllowedError);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Security Perimeter Blocked'),
      expect.any(Object)
    );
  });

  it('should successfully extract and process the query when the input payload arrives wrapped inside a nested object container', async () => {
    const command = new StartRunCommand(
      mockPermissions,
      mockAgentsMap,
      mockConsumeRateLimit,
      mockRunStore,
      {},
      mockCredentials
    );

    const wrappedInput: PackedRequestInput = {
      ...validRequestInput,
      body: { input: { query: '    Verify nested body extraction routines    ' } },
    };

    await command.execute(wrappedInput, mockContext);
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('Initializing agent thread lifecycle'),
      expect.objectContaining({ queryLength: 38 })
    );
  });

  it('should trigger an infrastructure timeout error when the database ledger write hangs indefinitely', async () => {
    // Inject a short timeout configuration parameter value to force the timeout promise race condition
    const hardeningOptions = { timeoutMs: 1 };
    const command = new StartRunCommand(
      mockPermissions,
      mockAgentsMap,
      mockConsumeRateLimit,
      mockRunStore,
      hardeningOptions,
      mockCredentials
    );

    mockRunStore.createRun.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 5000)));

    await expect(command.execute(validRequestInput, mockContext)).rejects.toThrow(
      'An infrastructure exception blocked workflow thread execution provisioning channels.'
    );
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Critical Persistence Ledger Allocation Failure'),
      expect.objectContaining({
        errorMessage: expect.stringContaining('Core storage ledger allocation operation exceeded system time limits'),
      })
    );
  });

  it('should accurately handle and normalize multi-line prompt structures containing trailing carriage returns', async () => {
    const command = new StartRunCommand(
      mockPermissions,
      mockAgentsMap,
      mockConsumeRateLimit,
      mockRunStore,
      {},
      mockCredentials
    );

    const complexWhitespaceInput: PackedRequestInput = {
      ...validRequestInput,
      body: { query: '\n\tAnalyze cluster vulnerabilities across network subnets\r\n' },
      headers: { 'x-requested-with': 'XMLHttpRequest' },
    };

    const result = await command.execute(complexWhitespaceInput, mockContext);
    expect(result.status).toBe('accepted');
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('Initializing agent thread lifecycle'),
      expect.objectContaining({ queryLength: 54 })
    );
  });

  it('should catch database unique constraint or duplicate primary key conflicts and mask them safely', async () => {
    const command = new StartRunCommand(
      mockPermissions,
      mockAgentsMap,
      mockConsumeRateLimit,
      mockRunStore,
      {},
      mockCredentials
    );

    mockRunStore.createRun.mockRejectedValue(new Error('Key (id)=(run_collision_id) already exists.'));

    await expect(command.execute(validRequestInput, mockContext)).rejects.toThrow(
      'An infrastructure exception blocked workflow thread execution provisioning channels.'
    );
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Critical Persistence Ledger Allocation Failure'),
      expect.objectContaining({
        errorMessage: expect.stringContaining('already exists'),
      })
    );
  });

  it('should safely fall back to the default 10-second timeout if hardening.timeoutMs is misconfigured as 0 or negative', async () => {
    // Force a misconfigured value to test the fallback mechanism
    const badHardening = { timeoutMs: 0 };
    const command = new StartRunCommand(
      mockPermissions,
      mockAgentsMap,
      mockConsumeRateLimit,
      mockRunStore,
      badHardening,
      mockCredentials
    );

    mockRunStore.createRun.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 50)));

    const result = await command.execute(validRequestInput, mockContext);
    expect(result.status).toBe('accepted');
    expect(mockRunStore.createRun).toHaveBeenCalled();
  });
});
