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
import { ConflictError, InputError, NotAllowedError, NotFoundError } from '@backstage/errors';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { approveRunAction, startRunAction, streamRunEventsAction } from '../run';

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

describe('streamRunEventsAction - Live Event Stream Pipeline Gateway', () => {
  let mockLogger: any;
  let mockRunStore: any;
  let mockRuntime: any;
  let mockContext: any;
  let mockResponse: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };

    mockRunStore = {
      getRun: vi.fn().mockResolvedValue({ id: 'run_123', status: 'initialized' })
    };

    mockRuntime = {
      run: vi.fn().mockImplementation(async function* () {
        yield { type: 'token', data: { text: 'Hello' } };
        yield { type: 'token', data: { text: ' World' } };
      })
    };

    mockContext = {
      logger: mockLogger,
      runStore: mockRunStore,
      runtime: mockRuntime,
      toolRegistry: {},
      hardening: {}
    };

    // Ensure all required Express streaming response event emitters are cleanly stubbed
    mockResponse = {
      writeHead: vi.fn(),
      write: vi.fn().mockReturnValue(true),
      flush: vi.fn(),
      once: vi.fn(),
      end: vi.fn(),
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis()
    };
  });

  it('should immediately raise an InputError if path variables fail schema validation contracts', async () => {
    const brokenRequest = {
      params: { id: '' },
      query: {},
      headers: {},
      on: vi.fn()
    } as unknown as Request;

    await expect(
      streamRunEventsAction(brokenRequest, mockResponse, mockContext, 'user:default/auditor')
    ).rejects.toThrow(InputError);

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('SSE Stream Initialization Dropped'),
      expect.any(Object)
    );
  });

  it('should throw a NotFoundError if the requested runId cannot be located inside the data store (IDOR Guard)', async () => {
    const unmappedRequest = {
      params: { id: 'run_unmapped_ghost_token' },
      query: {},
      headers: {},
      on: vi.fn()
    } as unknown as Request;

    mockRunStore.getRun.mockResolvedValue(null);

    await expect(
      streamRunEventsAction(unmappedRequest, mockResponse, mockContext, 'user:default/attacker')
    ).rejects.toThrow(NotFoundError);

    expect(mockRuntime.run).not.toHaveBeenCalled();
  });

  it('should process HTTP reconnection headers, stream tokens cleanly, and issue a native end execution signal', async () => {
    const validStreamingRequest = {
      params: { id: 'run_123' },
      query: { agentId: 'test-agent', query: 'Process tokens' },
      headers: { 'last-event-id': '42' },
      on: vi.fn() // Safe operational listener hook bypass
    } as unknown as Request;

    await streamRunEventsAction(
      validStreamingRequest,
      mockResponse,
      mockContext,
      'user:default/authorized-developer'
    );

    expect(mockResponse.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({
      'Content-Type': 'text/event-stream',
      'Connection': 'keep-alive'
    }));

    expect(mockRuntime.run).toHaveBeenCalledWith(
      expect.objectContaining({ runId: 'run_123', agentId: 'test-agent' }),
      expect.objectContaining({ identity: 'user:default/authorized-developer' })
    );

    expect(mockResponse.write).toHaveBeenCalledWith(expect.stringContaining('event: token'));
    expect(mockResponse.end).toHaveBeenCalled();
  });

  describe('streamRunEventsAction Advanced Enterprise Boundary & Chaos Scenarios', () => {
    it('should fall back safely to a zero sequence index if the client sends a malformed Last-Event-ID', async () => {
      const corruptIdRequest = {
        params: { id: 'run_123' },
        query: { agentId: 'test-agent' },
        headers: { 'last-event-id': '99_corrupt_overflow_token' },
        on: vi.fn()
      } as unknown as Request;

      await streamRunEventsAction(corruptIdRequest, mockResponse, mockContext, 'test-user');

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Established live Server-Sent Events tracking pipeline channel context'),
        expect.objectContaining({ resumedFromSequence: 0 })
      );
    });

    it('should engage an explicit AbortSignal and terminate underlying engine streaming if the network container closes prematurely', async () => {
      const closedStreamingRequest = {
        params: { id: 'run_123' },
        query: { agentId: 'test-agent' },
        headers: {},
        on: vi.fn() 
      } as unknown as Request;

      let captureCloseCallback: (() => void) | undefined = undefined;

      (closedStreamingRequest.on as any).mockImplementation((event: string, callback: () => void) => {
        if (event === 'close') captureCloseCallback = callback;
      });

      // Fix: Trigger the request network closure mid-iteration inside the active streaming generator loop
      mockRuntime.run.mockImplementation(async function* () {
        yield { type: 'token', data: { text: 'First slice' } };

        // Simulate the client dropping the connection abruptly while processing bytes
        if (captureCloseCallback) {
          (captureCloseCallback as () => void)();
        }

        yield { type: 'token', data: { text: 'Dangling untracked token slice' } };
      });

      // Execute and await the action promise now that the close trigger is correctly synchronized mid-stream
      await streamRunEventsAction(
        closedStreamingRequest,
        mockResponse,
        mockContext,
        'user:default/disconnecting-tester'
      );

      // Verify the unified cleanup logs track the close termination status accurately
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Terminating event stream response channel bounds'),
        expect.objectContaining({ 
          runId: 'run_123', 
          userRef: 'user:default/disconnecting-tester', 
          abortedByClient: true 
        })
      );
    });

    it('should respect network backpressure by pausing the event stream loop until a drain event is emitted', async () => {
      const backpressureRequest = {
        params: { id: 'run_123' },
        query: { agentId: 'test-agent' },
        headers: {},
        on: vi.fn()
      } as unknown as Request;

      mockResponse.write
        .mockReturnValueOnce(true)   // id
        .mockReturnValueOnce(true)   // event
        .mockReturnValueOnce(false)  // saturates network buffer data chunk
        .mockReturnValue(true);

      let triggerDrainCallback: (() => void) | undefined = undefined;
      mockResponse.once.mockImplementation((event: string, callback: () => void) => {
        if (event === 'drain') triggerDrainCallback = callback;
      });

      const actionPromise = streamRunEventsAction(backpressureRequest, mockResponse, mockContext, 'test-user');

      await new Promise(resolve => setImmediate(resolve));

      expect(triggerDrainCallback).toBeDefined();

      if (triggerDrainCallback) {
        (triggerDrainCallback as () => void)();
      }

      await actionPromise;
      expect(mockResponse.end).toHaveBeenCalled();
    });

    it('should inject a safe error token and terminate the response cleanly if the generator crashes mid-stream', async () => {
      const runtimeCrashRequest = {
        params: { id: 'run_123' },
        query: { agentId: 'test-agent' },
        headers: {},
        on: vi.fn()
      } as unknown as Request;

      mockRuntime.run.mockImplementation(async function* () {
        throw new Error('Vector engine socket disconnected or timed out mid-iteration');
      });

      await streamRunEventsAction(runtimeCrashRequest, mockResponse, mockContext, 'user:default/ops-engineer');

      // Verify the internal error tracking payload mapped correctly
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
});

describe('approveRunAction - Supervised Checkpoint Approval Boundary', () => {
  let mockLogger: any;
  let mockRunStore: any;
  let mockRuntime: any;
  let mockContext: any;
  let mockResponse: Partial<Response>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn()
    };

    mockRunStore = {
      getRun: vi.fn().mockResolvedValue({ id: 'run_123', actorIdentity: 'user:default/original-developer-creator' }),
      decideApproval: vi.fn().mockResolvedValue(undefined)
    };

    mockRuntime = {
      resume: vi.fn().mockImplementation(async function* () {
        yield { type: 'step', data: { phase: 'exit' } };
      })
    };

    mockContext = {
      logger: mockLogger,
      runStore: mockRunStore,
      runtime: mockRuntime,
      toolRegistry: {},
      hardening: {}
    };

    mockResponse = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis()
    };
  });

  it('should immediately raise an InputError if input params or body contents breach Zod validation parameters', async () => {
    const invalidRequest = {
      params: { id: '' },
      body: {}
    } as unknown as Request;

    await expect(
      approveRunAction(invalidRequest, mockResponse as Response, mockContext, 'user:default/reviewer')
    ).rejects.toThrow(InputError);
  });

  it('should throw a NotAllowedError if the executing reviewer is identical to the run initiator (Anti-Self-Approval Check)', async () => {
    const maliciousSelfApprovalRequest = {
      params: { id: 'run_123' },
      body: { status: 'approved', note: 'Looks good to me!' }
    } as unknown as Request;

    await expect(
      approveRunAction(maliciousSelfApprovalRequest, mockResponse as Response, mockContext, 'user:default/original-developer-creator')
    ).rejects.toThrow(NotAllowedError);

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Governance Breach Prevented'),
      expect.any(Object)
    );
  });

  it('should pass parameters forward, map the verified identity, and wake up execution streams on successful approvals', async () => {
    const validApprovalRequest = {
      params: { id: 'run_123' },
      body: { status: 'approved', note: 'Compliance metrics validated and cleared.' }
    } as unknown as Request;

    const response = await approveRunAction(
      validApprovalRequest,
      mockResponse as Response,
      mockContext,
      'user:default/independent-compliance-manager'
    );

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.send).toHaveBeenCalledWith({
      success: true,
      status: 'Run loop unblocked as: approved'
    });

    expect(mockRunStore.decideApproval).toHaveBeenCalledWith(
      'run_123',
      expect.objectContaining({ status: 'approved', decidedBy: 'user:default/independent-compliance-manager' })
    );

    expect(mockRuntime.resume).toHaveBeenCalledWith(
      'run_123',
      expect.any(Object),
      expect.objectContaining({ identity: 'user:default/independent-compliance-manager' })
    );
  });

  it('should process macro-task queue drainage sequentially using setImmediate before invoking engine resumptions', async () => {
    const validApprovalRequest = {
      params: { id: 'run_123' },
      body: { status: 'approved', note: 'Clear sequence index boundaries' }
    } as unknown as Request;

    const executionOrderTraces: string[] = [];

    // Spy on the database write and engine resumption hooks to track precise operation timing
    mockRunStore.decideApproval.mockImplementation(async () => {
      executionOrderTraces.push('DATABASE_WRITE_COMMITTED');
    });

    mockRuntime.resume.mockImplementation(async function* () {
      executionOrderTraces.push('ENGINE_RESUMPTION_WAKING');
      yield { type: 'step', data: { phase: 'exit' } };
    });

    await approveRunAction(
      validApprovalRequest,
      mockResponse as Response,
      mockContext,
      'user:default/independent-auditor'
    );

    // Verify the database write explicitly finished and committed BEFORE the engine began its resumption loop
    expect(executionOrderTraces).toEqual(['DATABASE_WRITE_COMMITTED', 'ENGINE_RESUMPTION_WAKING']);
  });

  it('should immediately raise a ConflictError if attempting to approve a run thread that is already marked as completed', async () => {
    const duplicateApprovalRequest = {
      params: { id: 'run_123' },
      body: { status: 'approved', note: 'Attempting a redundant review signature block' }
    } as unknown as Request;

    // Simulate the database returning a run state ledger that has already concluded its execution
    mockRunStore.getRun.mockResolvedValue({
      id: 'run_123',
      agentId: 'assistant-crew',
      actorIdentity: 'user:default/original-developer-creator',
      status: 'done', // Execution already finalized
      createdAt: new Date().toISOString() // Satisfies required RunRecord parameter bounds
    });

    // Assert that the function throws an official Backstage ConflictError instance
    await expect(
      approveRunAction(duplicateApprovalRequest, mockResponse as Response, mockContext, 'user:default/reviewer')
    ).rejects.toThrow(ConflictError);

    // Assert that the specific user-facing message maps cleanly
    await expect(
      approveRunAction(duplicateApprovalRequest, mockResponse as Response, mockContext, 'user:default/reviewer')
    ).rejects.toThrow("The workflow run 'run_123' cannot be modified because its current status is already 'done'.");

    // Verify that the system logged the conflict warning metric to monitoring pools
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Approval Request Rejected: Cannot mutate a run that is already in a final or active state'),
      expect.objectContaining({
        runId: 'run_123',
        currentStatus: 'done',
        userRef: 'user:default/reviewer'
      })
    );

    // Verify that execution paths short-circuited and the database write/resumptions were completely bypassed
    expect(mockRunStore.decideApproval).not.toHaveBeenCalled();
    expect(mockRuntime.resume).not.toHaveBeenCalled();
  });

  it('should safely normalize and trim excess whitespace parameters from reviewer notes to preserve audit text consistency', async () => {
    const messyNoteRequest = {
      params: { id: 'run_123' },
      body: { status: 'approved', note: '   \n\tManual review checkpoint cleared securely.\r\n   ' }
    } as unknown as Request;

    await approveRunAction(
      messyNoteRequest,
      mockResponse as Response,
      mockContext,
      'user:default/compliance-officer'
    );

    // Verify the decision structure passed to the database received a clean, normalized string
    expect(mockRunStore.decideApproval).toHaveBeenCalledWith(
      'run_123',
      expect.objectContaining({
        note: 'Manual review checkpoint cleared securely.'
      })
    );
  });

  it('should successfully process actions and track non-repudiation when initialized by an automated System Service Principal identifier', async () => {
    const servicePrincipalRequest = {
      params: { id: 'run_555' },
      body: { status: 'approved', note: 'Automated background batch verification pass complete.' }
    } as unknown as Request;

    // Mock the run store to return an active run originally provisioned by an external automated worker principal
    mockRunStore.getRun.mockResolvedValue({ 
      id: 'run_555', 
      agentId: 'compliance-agent',
      status: 'paused',
      actorIdentity: 'system:service-principal/cron-scheduler-job', // Core service principal token signature format
      createdAt: new Date().toISOString()
    });

    // An independent service principal reviewer steps in to authorize continuation parameters
    await approveRunAction(
      servicePrincipalRequest,
      mockResponse as Response,
      mockContext,
      'system:service-principal/independent-security-scanner'
    );

    // Verify that the supervisor audit log tracks the service principal signature cleanly
    expect(mockRunStore.decideApproval).toHaveBeenCalledWith(
      'run_555',
      expect.objectContaining({
        status: 'approved',
        decidedBy: 'system:service-principal/independent-security-scanner'
      })
    );
  });

  it('should successfully record the review decision to the ledger and return a 200 status code even if runtime.resume is un-implemented', async () => {
    const basicRecordRequest = {
      params: { id: 'run_123' },
      body: { status: 'rejected', note: 'Security requirements unmet.' }
    } as unknown as Request;

    // Simulate an engine or third-party workflow context that lacks the optional resume executor function hook
    mockContext.runtime.resume = undefined;

    const response = await approveRunAction(
      basicRecordRequest,
      mockResponse as Response,
      mockContext,
      'user:default/independent-auditor'
    );

    expect(response.status).toHaveBeenCalledWith(200);

    // Proves that even without an active resumption engine stream, the audit ledger transaction is fully written and preserved
    expect(mockRunStore.decideApproval).toHaveBeenCalledWith(
      'run_123',
      expect.objectContaining({ status: 'rejected', decidedBy: 'user:default/independent-auditor' })
    );
  });
});
