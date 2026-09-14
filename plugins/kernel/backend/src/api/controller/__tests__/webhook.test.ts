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
import { webhookRunAction } from '../webhook';

describe('webhookRunAction - Controlled Third-Party Webhook Ingestion Boundary', () => {
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
        yield { type: 'done', data: { runId: 'run_valid' } };
      })
    };

    mockContext = {
      logger: mockLogger,
      runtime: mockRuntime,
      agents: new Map([['webhook-handler-agent', { id: 'webhook-handler-agent' }]]),
      triggers: [
        { id: 'github-pr-closed', source: 'github', agentId: 'webhook-handler-agent' }
      ],
      toolRegistry: {},
      hardening: {}
    };

    mockResponse = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis()
    };
  });

  it('should immediately raise an InputError if validation fields fail Zod parsing contracts', async () => {
    const invalidRequest = {
      params: { provider: '' },
      body: {}
    } as unknown as Request;

    await expect(
      webhookRunAction(invalidRequest, mockResponse as Response, mockContext, 'system:service-principal/github-gateway')
    ).rejects.toThrow(InputError);
  });

  it('should throw an explicit NotFoundError if no active rule maps to provider parameter combinations', async () => {
    const unmappedRequest = {
      params: { provider: 'gitlab' }, // rule registry only covers 'github'
      body: { triggerId: 'github-pr-closed', query: 'Process hook data' }
    } as unknown as Request;

    await expect(
      webhookRunAction(unmappedRequest, mockResponse as Response, mockContext, 'system:service-principal/github-gateway')
    ).rejects.toThrow(NotFoundError);
  });

  it('should throw an InputError and bypass execution loops when encountering a Ghost Agent mapping reference', async () => {
    const ghostRequest = {
      params: { provider: 'github' },
      body: { triggerId: 'github-pr-closed', query: 'Process hook data' }
    } as unknown as Request;

    // Simulate agent being deleted or unmapped from active memory
    mockContext.agents = new Map();

    await expect(
      webhookRunAction(ghostRequest, mockResponse as Response, mockContext, 'system:service-principal/github-gateway')
    ).rejects.toThrow(InputError);

    expect(mockRuntime.run).not.toHaveBeenCalled();
  });

  it('should pass parameters forward, verify identity bounds, and capture async done event streams', async () => {
    const validRequest = {
      params: { provider: 'github' },
      body: { triggerId: 'github-pr-closed', query: 'Deploying engineering-service artifact updates' },
      path: '/events/webhook'
    } as unknown as Request;

    const response = await webhookRunAction(
      validRequest,
      mockResponse as Response,
      mockContext,
      'system:service-principal/github-gateway'
    );

    expect(response.status).toHaveBeenCalledWith(202);
    expect(response.send).toHaveBeenCalledWith(expect.objectContaining({
      status: 'webhook_processing_dispatched'
    }));

    // Verify identity string was preserved correctly into the context blueprint
    expect(mockRuntime.run).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: 'webhook-handler-agent', trigger: 'webhook-github' }),
      expect.objectContaining({ identity: 'system:service-principal/github-gateway' })
    );

    // Wait for the asynchronous background iterable thread loop to resolve completely
    await new Promise(resolve => setImmediate(resolve));

    // Verify that the completion token event was intercepted and logged explicitly
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('Webhook orchestrated agent run thread successfully completed task actions'),
      expect.objectContaining({ provider: 'github', userRef: 'system:service-principal/github-gateway' })
    );
  });

  it('should successfully strip out special characters from injection-prone webhook parameters before matching bindings', async () => {
    const maliciousRequest = {
      params: { provider: 'github/../traversal-attempt' }, // Malicious format attack
      body: { triggerId: 'github-pr-closed!!', query: 'Process payload safely' },
      headers: { 'content-length': '150' }
    } as unknown as Request;

    // The handler should normalize 'github/../traversal-attempt' to 'githubtraversal-attempt'
    // and 'github-pr-closed!!' to 'github-pr-closed', which triggers an expected NotFoundError
    await expect(
      webhookRunAction(maliciousRequest, mockResponse as Response, mockContext, 'system:service-principal/github-gateway')
    ).rejects.toThrow(NotFoundError);

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Webhook invocation ignored: Provider mapping target has no matching configuration rules'),
      expect.objectContaining({
        provider: 'githubtraversal-attempt', // Verifies exact sanitized alphanumeric value
        triggerId: 'github-pr-closed'       // Verifies exact sanitized alphanumeric value
      })
    );
  });

  it('should fall back to calculate request size from the body literal when Content-Length headers are completely missing', async () => {
    const bareRequest = {
      params: { provider: 'github' },
      body: { triggerId: 'github-pr-closed', query: 'Payload sizing fallback validation check' },
      headers: {}, // Empty headers tracking object block scenario
      path: '/events/webhook'
    } as unknown as Request;

    const response = await webhookRunAction(
      bareRequest,
      mockResponse as Response,
      mockContext,
      'system:service-principal/github-gateway'
    );

    expect(response.status).toHaveBeenCalledWith(202);

    // Prove it gracefully calculates dynamic payload size metric tracking
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('Authorized external webhook alert originating from provider boundary'),
      expect.objectContaining({
        payloadSizeBytes: expect.any(Number)
      })
    );
  });

  it('should deploy defensive default objects when the background loop handles a null error token exception', async () => {
    const faultyStreamRequest = {
      params: { provider: 'github' },
      body: { triggerId: 'github-pr-closed', query: 'Evaluate edge exception cascades' },
      headers: { 'content-length': '120' },
      path: '/events/webhook'
    } as unknown as Request;

    // Force run to throw a raw blank null object to simulate exotic runtime worker thread stalls
    mockRuntime.run.mockImplementation(() => {
      throw null; 
    });

    await webhookRunAction(
      faultyStreamRequest,
      mockResponse as Response,
      mockContext,
      'system:service-principal/github-gateway'
    );

    // Allow microtask thread boundaries to execute completely
    await new Promise(resolve => setImmediate(resolve));

    // Verify the error handler defaults to the safe fallback object specification
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Fatal background loop system processing crack encountered on webhook run tracker'),
      expect.objectContaining({
        errorName: 'Error',
        errorMessage: 'Opaque un-handled microtask worker thread exception'
      })
    );
  });

  it('should successfully handle query payloads containing whitespace padding mutations without shifting mapping tracks', async () => {
    const spacePaddedRequest = {
      params: { provider: 'github' },
      body: { triggerId: 'github-pr-closed', query: '   Trigger text payload containing loose trailing tabs \n   ' },
      headers: { 'content-length': '150' },
      path: '/events/webhook'
    } as unknown as Request;

    await webhookRunAction(
      spacePaddedRequest,
      mockResponse as Response,
      mockContext,
      'system:service-principal/github-gateway'
    );

    // Verify parameters are cleanly mapped through to ensure downstream engine text extraction stability
    expect(mockRuntime.run).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          query: '   Trigger text payload containing loose trailing tabs \n   '
        })
      }),
      expect.any(Object)
    );
  });
});
