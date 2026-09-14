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
import { Request, Response } from 'express';
import { InputError, NotAllowedError } from '@backstage/errors';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { startRunAction } from '../run';

describe('startRunAction - Core Agentic Thread Lifecycle Orchestrator', () => {
  let mockLogger: any;
  let mockRunStore: any;
  let mockContext: any;
  let mockResponse: Partial<Response>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };

    mockRunStore = {
      createRun: vi.fn().mockResolvedValue(undefined)
    };

    mockContext = {
      logger: mockLogger,
      consumeRateLimit: vi.fn().mockReturnValue(true),
      agents: new Map([['assistant-crew', { id: 'assistant-crew' }]]),
      runStore: mockRunStore
    };

    mockResponse = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis()
    };
  });

  it('should immediately raise an InputError if validation fields fail Zod parsing parameters', async () => {
    const brokenRequest = {
      params: { id: '' },
      body: {},
      headers: { authorization: 'Bearer test-token-profile' }
    } as unknown as Request;

    await expect(
      startRunAction(brokenRequest, mockResponse as Response, mockContext, 'user:default/kevin')
    ).rejects.toThrow(InputError);

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Run Initialization Dropped'),
      expect.any(Object)
    );
  });

  it('should throw an explicit InputError if the requested agentId is unmapped inside engine keys', async () => {
    const unmappedRequest = {
      params: { id: 'ghost-agent-identifier-token' },
      body: { query: 'Analyze logs' },
      headers: { authorization: 'Bearer test-token-profile' }
    } as unknown as Request;

    await expect(
      startRunAction(unmappedRequest, mockResponse as Response, mockContext, 'user:default/kevin')
    ).rejects.toThrow(InputError);
  });

  it('should return a 429 status code if local rate limit token buckets evaluate as exhausted', async () => {
    const throttledRequest = {
      params: { id: 'assistant-crew' },
      body: { query: 'Execute sequence' },
      headers: { authorization: 'Bearer test-token-profile' }
    } as unknown as Request;

    mockContext.consumeRateLimit.mockReturnValue(false);

    const response = await startRunAction(
      throttledRequest,
      mockResponse as Response,
      mockContext,
      'user:default/rapid-caller'
    );

    expect(response.status).toHaveBeenCalledWith(429);
    expect(response.send).toHaveBeenCalledWith({ message: 'Rate limit exceeded for agent' });
    expect(mockRunStore.createRun).not.toHaveBeenCalled();
  });

  it('should verify structural elements, provision a durable ledger item, and acknowledge with a 202 receipt', async () => {
    const validRequest = {
      params: { id: 'assistant-crew' },
      body: { query: 'Execute system optimization checklist mappings' },
      headers: { authorization: 'Bearer test-token-profile' },
      path: '/runs/start'
    } as unknown as Request;

    const response = await startRunAction(
      validRequest,
      mockResponse as Response,
      mockContext,
      'user:default/lead-engineer'
    );

    expect(response.status).toHaveBeenCalledWith(202);
    expect(mockRunStore.createRun).toHaveBeenCalledWith(expect.objectContaining({
      id: expect.any(String),
      agentId: 'assistant-crew',
      status: 'initialized',
      createdAt: expect.any(String)
    }));
  });

  it('should verify structural elements, provision a durable ledger item, and acknowledge with a 202 receipt', async () => {
    const validRequest = {
      body: { query: 'Execute system optimization checklist mappings' },
      params: { id: 'assistant-crew' },
      headers: { authorization: 'Bearer test-token-profile' },
      path: '/runs/start'
    } as unknown as Request;

    const response = await startRunAction(
      validRequest,
      mockResponse as Response,
      mockContext,
      'user:default/lead-engineer'
    );

    expect(response.status).toHaveBeenCalledWith(202);
    expect(mockRunStore.createRun).toHaveBeenCalledWith(expect.objectContaining({
      id: expect.any(String),
      agentId: 'assistant-crew',
      status: 'initialized',
      createdAt: expect.any(String)
    }));
  });

  it('should securely catch async database errors and mask raw cluster details from the client response', async () => {
    const errorProneRequest = {
      body: { query: 'Execute sequence metrics' },
      params: { id: 'assistant-crew' },
      headers: { authorization: 'Bearer test-token-profile' },
      path: '/runs/start'
    } as unknown as Request;

    mockRunStore.createRun.mockRejectedValue(new Error('FATAL: pool connection timeout on node address 10.0.4.12'));

    await expect(
      startRunAction(errorProneRequest, mockResponse as Response, mockContext, 'user:default/admin')
    ).rejects.toThrow('An infrastructure exception blocked workflow thread execution provisioning channels.');

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Critical Persistence Ledger Allocation Failure'),
      expect.objectContaining({
        agentId: 'assistant-crew',
        errorMessage: 'FATAL: pool connection timeout on node address 10.0.4.12'
      })
    );
  });

  it('should immediately reject request executions with a NotAllowedError if custom headers are completely missing during cookie Ingress tracks', async () => {
    const missingHeadersRequest = {
      body: { query: 'Execute unauthorized step allocation' },
      params: { id: 'assistant-crew' },
      headers: {
        // Simulating standard cookie auth without passing 'authorization' or 'x-requested-with' token fields
        host: 'backstage.internal.net'
      },
      path: '/runs/start'
    } as unknown as Request;

    await expect(
      startRunAction(missingHeadersRequest, mockResponse as Response, mockContext, 'user:default/victim-user')
    ).rejects.toThrow(NotAllowedError);

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Security Perimeter Blocked'),
      expect.any(Object)
    );
  });

  it('should successfully extract and process the query when the input payload arrives wrapped inside a nested object container', async () => {
    const wrappedPayloadRequest = {
      body: {
        input: { query: '    Verify nested body extraction routines    ' }
      },
      params: { id: 'assistant-crew' },
      headers: { authorization: 'Bearer token_123' },
      path: '/runs/start'
    } as unknown as Request;

    await startRunAction(
      wrappedPayloadRequest,
      mockResponse as Response,
      mockContext,
      'user:default/developer'
    );

    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('Initializing agent thread lifecycle'),
      expect.objectContaining({
        queryLength: 38
      })
    );
  });

  it('should trigger an infrastructure timeout error when the database ledger write hangs indefinitely', async () => {
    const slowDbRequest = {
      body: { query: 'Execute sequence over a stalled persistence cluster' },
      params: { id: 'assistant-crew' },
      headers: { authorization: 'Bearer token_456' },
      path: '/runs/start'
    } as unknown as Request;

    // Inject a short timeout threshold to force the timeout promise to win the race
    mockContext.hardening = { timeoutMs: 1 };

    // Simulate a database driver that hangs and never resolves its connection pool slot
    mockRunStore.createRun.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 5000)));

    await expect(
      startRunAction(slowDbRequest, mockResponse as Response, mockContext, 'user:default/operator')
    ).rejects.toThrow('An infrastructure exception blocked workflow thread execution provisioning channels.');

    // Verify that the internal log caught the specific timeout trace details
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Critical Persistence Ledger Allocation Failure'),
      expect.objectContaining({
        errorMessage: expect.stringContaining('Core storage ledger allocation operation exceeded system time limits')
      })
    );
  });

    it('should accurately handle and normalize multi-line prompt structures containing trailing carriage returns', async () => {
      const complexWhitespaceRequest = {
        body: { query: '\n\tAnalyze cluster vulnerabilities across network subnets\r\n' },
        params: { id: 'assistant-crew' },
        headers: { 'x-requested-with': 'XMLHttpRequest' },
        path: '/runs/start'
      } as unknown as Request;

      const response = await startRunAction(
        complexWhitespaceRequest,
        mockResponse as Response,
        mockContext,
        'user:default/security-auditor'
      );

      expect(response.status).toHaveBeenCalledWith(202);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Initializing agent thread lifecycle'),
        expect.objectContaining({
          queryLength: 54
        })
      );
    });

  it('should catch database unique constraint or duplicate primary key conflicts and mask them safely', async () => {
    const duplicateRequest = {
      body: { query: 'Execute critical infrastructure task execution step' },
      params: { id: 'assistant-crew' },
      headers: { authorization: 'Bearer token_abc_123' },
      path: '/runs/start'
    } as unknown as Request;

    // Simulate a rare database primary key collision or index constraint failure
    mockRunStore.createRun.mockRejectedValue(new Error('Key (id)=(run_collision_id) already exists.'));

    await expect(
      startRunAction(duplicateRequest, mockResponse as Response, mockContext, 'user:default/admin')
    ).rejects.toThrow('An infrastructure exception blocked workflow thread execution provisioning channels.');

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Critical Persistence Ledger Allocation Failure'),
      expect.objectContaining({
        errorMessage: expect.stringContaining('already exists')
      })
    );
  });

  it('should safely fall back to the default 10-second timeout if hardening.timeoutMs is misconfigured as 0 or negative', async () => {
    const badConfigValueRequest = {
      body: { query: 'Execute sequence over a misconfigured timeout allocation boundary' },
      params: { id: 'assistant-crew' },
      headers: { authorization: 'Bearer token_xyz_789' },
      path: '/runs/start'
    } as unknown as Request;

    // Force a misconfigured, un-checked zero or negative timeout value from standard configuration files
    mockContext.hardening = { timeoutMs: 0 };

    // If the code doesn't guard against <= 0, a setTimeout(..., 0) will execute instantly, causing a premature timeout rejection.
    // We mock createRun to resolve after 50ms, proving the 10-second fallback handles it without tripping.
    mockRunStore.createRun.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 50)));

    const response = await startRunAction(
      badConfigValueRequest,
      mockResponse as Response,
      mockContext,
      'user:default/sysops'
    );

    expect(response.status).toHaveBeenCalledWith(202);
    expect(mockRunStore.createRun).toHaveBeenCalled();
  });
});
