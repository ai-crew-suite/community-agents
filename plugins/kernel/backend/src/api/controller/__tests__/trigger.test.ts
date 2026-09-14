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
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Request, Response } from 'express';
import { InputError, NotFoundError } from '@backstage/errors';
import { triggerRunAction } from '../trigger';

describe('triggerRunAction - Automated Infrastructure Event Processing Gateway', () => {
  let mockLogger: any;
  let mockRuntime: any;
  let mockContext: any;
  let mockResponse: Partial<Response>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };

    mockRuntime = {
      run: vi.fn().mockImplementation(async function* () {
        yield { type: 'step', data: { phase: 'enter' } };
      })
    };

    mockContext = {
      logger: mockLogger,
      runtime: mockRuntime,
      agents: new Map([['compliance-agent', { id: 'compliance-agent' }]]),
      triggers: [
        { id: 'cron-hourly-sync', source: 'backstage-timer', agentId: 'compliance-agent' }
      ],
      toolRegistry: {},
      hardening: {}
    };

    mockResponse = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis()
    };
  });

  it('should instantly throw an InputError if incoming parameters fail parsing criteria checks', async () => {
    const invalidRequest = {
      params: { source: '' },
      body: {}
    } as unknown as Request;

    await expect(
      triggerRunAction(invalidRequest, mockResponse as Response, mockContext, 'system:service-principal/cron')
    ).rejects.toThrow(InputError);

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Infrastructure Validation Drop'),
      expect.any(Object)
    );
  });

  it('should throw an explicit NotFoundError if no configured trigger matches parameter keys', async () => {
    const unmappedRequest = {
      params: { source: 'unregistered-source-ref' },
      body: { triggerId: 'unmapped-id-token', query: 'Execute checks' }
    } as unknown as Request;

    await expect(
      triggerRunAction(unmappedRequest, mockResponse as Response, mockContext, 'system:service-principal/cron')
    ).rejects.toThrow(NotFoundError);
  });

  it('should pass type validations, link the verified service principal, and yield a 202 status code', async () => {
    const validRequest = {
      params: { source: 'backstage-timer' },
      body: { triggerId: 'cron-hourly-sync', query: 'Audit database tables execution schemas' },
      path: '/events/trigger'
    } as unknown as Request;

    const response = await triggerRunAction(
      validRequest,
      mockResponse as Response,
      mockContext,
      'system:service-principal/cron-scheduler'
    );

    expect(response.status).toHaveBeenCalledWith(202);
    expect(response.send).toHaveBeenCalledWith(expect.objectContaining({
      status: 'trigger_processing_dispatched'
    }));

    // Verify identity was propagated smoothly into the context boundary
    expect(mockRuntime.run).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: 'compliance-agent', trigger: 'cron-hourly-sync' }),
      expect.objectContaining({ identity: 'system:service-principal/cron-scheduler' })
    );
  });

  it('should capture fatal async generator rejections inside the background closure and log deep stack traces', async () => {
    const validRequest = {
      params: { source: 'backstage-timer' },
      body: { triggerId: 'cron-hourly-sync', query: 'Execute background database checks' },
      path: '/events/trigger'
    } as unknown as Request;

    // Simulate an immediate runtime crash when the engine attempts to generate the async iterable stream
    mockRuntime.run.mockImplementation(() => {
      const complexError = new Error('Critical file partition missing or database transaction closed');
      complexError.name = 'SystemPartitionFailureException';
      complexError.stack = 'Error: Critical file partition missing\n    at RunEngine.run (engine.ts:42:11)';
      throw complexError;
    });

    const response = await triggerRunAction(
      validRequest,
      mockResponse as Response,
      mockContext,
      'system:service-principal/cron-scheduler'
    );

    // Verify the API perimeter still acknowledges the dispatch successfully to the network infrastructure
    expect(response.status).toHaveBeenCalledWith(202);

    // Allow microtasks queue loop to clear so the detached async block executes completely
    await new Promise(resolve => setImmediate(resolve));

    // Confirm the internal error logger was fed deep stack diagnostic parameters
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Fatal background loop system processing crack encountered on automated run tracker'),
      expect.objectContaining({
        triggerId: 'cron-hourly-sync',
        userRef: 'system:service-principal/cron-scheduler',
        errorName: 'SystemPartitionFailureException',
        errorMessage: 'Critical file partition missing or database transaction closed',
        errorStack: expect.stringContaining('at RunEngine.run')
      })
    );
  });

  it('should catch a Ghost Agent reference, halt execution loops, and throw an InputError', async () => {
    const invalidAgentRequest = {
      params: { source: 'backstage-timer' },
      body: { triggerId: 'cron-hourly-sync', query: 'Process tasks' },
      path: '/events/trigger'
    } as unknown as Request;

    // Simulate a trigger pointing to a deleted or non-existent agent reference
    mockContext.agents = new Map(); // Empty map matches a missing configuration target

    await expect(
      triggerRunAction(invalidAgentRequest, mockResponse as Response, mockContext, 'system:service-principal/cron')
    ).rejects.toThrow(InputError);

    // Verify the execution loop is safely bypassed to avoid corruption loops
    expect(mockRuntime.run).not.toHaveBeenCalled();
  });

  it('should safely intercept intermediate error tokens emitted inside the asynchronous event stream and log telemetry data', async () => {
    const validStreamRequest = {
      params: { source: 'backstage-timer' },
      body: { triggerId: 'cron-hourly-sync', query: 'Process workflow elements' },
      path: '/events/trigger'
    } as unknown as Request;

    // Mock the async generator loop to simulate an engine error event halfway through execution
    mockRuntime.run.mockImplementation(async function* () {
      yield { type: 'step', data: { phase: 'enter' } };
      yield { 
        type: 'error', 
        data: { code: 'MODEL_RATE_LIMIT', message: '429 Token limit exhausted on external model provider', retryable: true } 
      };
    });

    const response = await triggerRunAction(
      validStreamRequest,
      mockResponse as Response,
      mockContext,
      'system:service-principal/cron-scheduler'
    );

    expect(response.status).toHaveBeenCalledWith(202);

    // Wait for the microtasks queue loop to clear so the detached async block executes completely
    await new Promise(resolve => setImmediate(resolve));

    // Verify the internal error logger captured the precise stream parameters
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Automated background run iteration reported engine failure'),
      expect.objectContaining({
        triggerId: 'cron-hourly-sync',
        userRef: 'system:service-principal/cron-scheduler',
        errorCode: 'MODEL_RATE_LIMIT',
        errorMessage: '429 Token limit exhausted on external model provider',
        retryable: true
      })
    );
  });
});
