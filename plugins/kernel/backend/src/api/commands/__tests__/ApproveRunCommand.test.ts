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
import { InputError, NotAllowedError, ConflictError, NotImplementedError } from '@backstage/errors';
import { BackstageCredentials } from '@backstage/backend-plugin-api';
import { ApproveRunCommand } from '../ApproveRunCommand';
import { CommandContext, PackedRequestInput } from '../types/shared';

describe('ApproveRunCommand - Supervised Checkpoint Approval Blueprint Domain Suite', () => {
  let mockLogger: any;
  let mockPermissions: any;
  let mockAgentRuntime: any;
  let mockRunStore: any;
  let mockContext: CommandContext;
  let mockCredentials: BackstageCredentials;

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

    mockAgentRuntime = {
      resume: vi.fn().mockImplementation(async function* () {
        yield { type: 'step', data: { phase: 'exit' } };
      }),
    };

    mockRunStore = {
      getRun: vi.fn().mockResolvedValue({
        id: 'run_123',
        actorIdentity: 'user:default/original-developer-creator',
        status: 'paused',
      }),
      decideApproval: vi.fn().mockResolvedValue(undefined),
    };

    mockContext = {
      actorIdentity: 'user:default/reviewer',
      createdAt: new Date().toISOString(),
      logger: mockLogger,
    };

    mockCredentials = {} as unknown as BackstageCredentials;
  });

  it('should throw an unrecoverable system exception and log an error metric if the permissions service response payload is completely empty', async () => {
    mockPermissions.authorize.mockResolvedValue([]);
    const command = new ApproveRunCommand({
      agentRuntime: mockAgentRuntime,
      permissions: mockPermissions,
      runStore: mockRunStore,
      hardening: {},
      credentials: mockCredentials,
    });

    const validInput: PackedRequestInput = {
      params: { id: 'run_123' },
      query: {},
      body: { status: 'approved' },
      headers: {},
    };

    await expect(command.execute(validInput, mockContext)).rejects.toThrow(
      'Internal authorization parsing failure encountered'
    );
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('RBAC approval evaluation failure: Authorization response payload was completely empty')
    );
  });


  it('should immediately raise an InputError if input params or body contents breach Zod validation parameters', async () => {
    const command = new ApproveRunCommand({
      agentRuntime: mockAgentRuntime,
      permissions: mockPermissions,
      runStore: mockRunStore,
      credentials: mockCredentials,
    });

    const invalidInput: PackedRequestInput = {
      params: { id: '' },
      query: {},
      body: {},
      headers: {},
    };

    await expect(command.execute(invalidInput, mockContext)).rejects.toThrow(InputError);
  });

  it('should throw an explicit NotImplementedError if the core RunStore layer is unconfigured', async () => {
    const command = new ApproveRunCommand({
      agentRuntime: mockAgentRuntime,
      permissions: mockPermissions,
      runStore: undefined,
      credentials: mockCredentials,
    });

    const validInput: PackedRequestInput = {
      params: { id: 'run_123' },
      query: {},
      body: { status: 'approved' },
      headers: {},
    };

    await expect(command.execute(validInput, mockContext)).rejects.toThrow(NotImplementedError);
  });

  it('should throw a NotAllowedError if the executing reviewer is identical to the run initiator (Anti-Self-Approval Check)', async () => {
    const command = new ApproveRunCommand({
      agentRuntime: mockAgentRuntime,
      permissions: mockPermissions,
      runStore: mockRunStore,
      credentials: mockCredentials,
    });

    const selfApprovalInput: PackedRequestInput = {
      params: { id: 'run_123' },
      query: {},
      body: { status: 'approved', note: 'Looks good to me!' },
      headers: {},
    };
    const selfContext: CommandContext = {
      ...mockContext,
      actorIdentity: 'user:default/original-developer-creator',
    };

    await expect(command.execute(selfApprovalInput, selfContext)).rejects.toThrow(NotAllowedError);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Governance Breach Prevented'),
      expect.any(Object)
    );
  });

  it('should pass parameters forward, map the verified identity, and wake up execution streams on successful approvals', async () => {
    const command = new ApproveRunCommand({
      agentRuntime: mockAgentRuntime,
      permissions: mockPermissions,
      runStore: mockRunStore,
      credentials: mockCredentials,
    });

    const validInput: PackedRequestInput = {
      params: { id: 'run_123' },
      query: {},
      body: { status: 'approved', note: 'Compliance metrics validated and cleared.' },
      headers: {},
    };
    const result = await command.execute(validInput, mockContext);

    expect(result).toEqual({
      success: true,
      status: 'Run loop unblocked as: approved',
    });
    expect(mockRunStore.decideApproval).toHaveBeenCalledWith(
      'run_123',
      expect.objectContaining({ status: 'approved', decidedBy: 'user:default/reviewer' })
    );
    expect(mockAgentRuntime.resume).toHaveBeenCalledWith(
      'run_123',
      expect.any(Object),
      expect.objectContaining({ identity: 'user:default/reviewer' })
    );
  });

  it('should process macro-task queue drainage sequentially using setImmediate before invoking engine resumptions', async () => {
    const command = new ApproveRunCommand({
      agentRuntime: mockAgentRuntime,
      permissions: mockPermissions,
      runStore: mockRunStore,
      credentials: mockCredentials,
    });

    const validInput: PackedRequestInput = {
      params: { id: 'run_123' },
      query: {},
      body: { status: 'approved', note: 'Clear sequence index boundaries' },
      headers: {},
    };
    const executionOrderTraces: string[] = [];

    mockRunStore.decideApproval.mockImplementation(async () => {
      executionOrderTraces.push('DATABASE_WRITE_COMMITTED');
    });

    mockAgentRuntime.resume.mockImplementation(async function* () {
      executionOrderTraces.push('ENGINE_RESUMPTION_WAKING');
      yield { type: 'step', data: { phase: 'exit' } };
    });

    await command.execute(validInput, mockContext);
    expect(executionOrderTraces).toEqual(['DATABASE_WRITE_COMMITTED', 'ENGINE_RESUMPTION_WAKING']);
  });

  it('should immediately raise a ConflictError if attempting to approve a run thread that is already marked as completed', async () => {
    const command = new ApproveRunCommand({
      agentRuntime: mockAgentRuntime,
      permissions: mockPermissions,
      runStore: mockRunStore,
      credentials: mockCredentials,
    });

    const duplicateInput: PackedRequestInput = {
      params: { id: 'run_123' },
      query: {},
      body: { status: 'approved', note: 'Attempting a redundant review signature block' },
      headers: {},
    };

    mockRunStore.getRun.mockResolvedValue({
      id: 'run_123',
      agentId: 'assistant-crew',
      actorIdentity: 'user:default/original-developer-creator',
      status: 'done',
      createdAt: new Date().toISOString(),
    });

    await expect(command.execute(duplicateInput, mockContext)).rejects.toThrow(ConflictError);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Approval Request Rejected: Cannot mutate a run that is already in a final or active state'),
      expect.any(Object)
    );
  });

  it('should safely normalize and trim excess whitespace parameters from reviewer notes to preserve audit text consistency', async () => {
    const command = new ApproveRunCommand({
      agentRuntime: mockAgentRuntime,
      permissions: mockPermissions,
      runStore: mockRunStore,
      credentials: mockCredentials,
    });

    const messyInput: PackedRequestInput = {
      params: { id: 'run_123' },
      query: {},
      body: { status: 'approved', note: '   \n\tManual review checkpoint cleared securely.\r\n   ' },
      headers: {},
    };

    await command.execute(messyInput, mockContext);
    expect(mockRunStore.decideApproval).toHaveBeenCalledWith(
      'run_123',
      expect.objectContaining({
        note: 'Manual review checkpoint cleared securely.',
      })
    );
  });

  it('should successfully process actions and track non-repudiation when initialized by an automated System Service Principal identifier', async () => {
    const command = new ApproveRunCommand({
      agentRuntime: mockAgentRuntime,
      permissions: mockPermissions,
      runStore: mockRunStore,
      credentials: mockCredentials,
    });

    const principalInput: PackedRequestInput = {
      params: { id: 'run_555' },
      query: {},
      body: { status: 'approved', note: 'Automated background pass complete.' },
      headers: {},
    };

    mockRunStore.getRun.mockResolvedValue({
      id: 'run_555',
      agentId: 'compliance-agent',
      status: 'paused',
      actorIdentity: 'system:service-principal/cron-scheduler-job',
      createdAt: new Date().toISOString(),
    });

    const serviceContext: CommandContext = {
      ...mockContext,
      actorIdentity: 'system:service-principal/independent-security-scanner',
    };

    await command.execute(principalInput, serviceContext);

    expect(mockRunStore.decideApproval).toHaveBeenCalledWith(
      'run_555',
      expect.objectContaining({
        status: 'approved',
        decidedBy: 'system:service-principal/independent-security-scanner',
      })
    );
  });
});
