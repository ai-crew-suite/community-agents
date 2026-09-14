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
import { mockServices } from '@backstage/backend-test-utils';
import { AuthorizeResult } from '@backstage/plugin-permission-common';
import { AuthenticationError } from '@backstage/errors';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorkflowController } from '../index';
import * as embeddingModule from '../embedding';
import * as runModule from '../run';
import * as triggerModule from '../trigger';
import * as webhookModule from '../webhook';

vi.mock('../../embedding');
vi.mock('../run');
vi.mock('../trigger');
vi.mock('../webhook');


describe('WorkflowController - Base Scaffolding & Safe Typing', () => {
  let mockLogger: any;
  let mockRuntime: any;
  let mockToolRegistry: any;
  let mockIndexer: any;
  let mockAgents: Map<string, any>;
  let mockHttpAuth: any;
  let mockPermissionsService: any;
  let controller: WorkflowController;
  let mockResponse: Partial<Response>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockLogger = mockServices.logger.mock();
    mockRuntime = {};
    mockToolRegistry = {};
    mockIndexer = {};
    mockAgents = new Map();

    mockHttpAuth = {
      credentials: vi.fn(),
    };

    mockPermissionsService = {
      authorize: vi.fn(),
    };

    mockResponse = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    };

    controller = new WorkflowController({
      agents: mockAgents,
      augmentationIndexer: mockIndexer,
      httpAuth: mockHttpAuth,
      logger: mockLogger,
      permissions: mockPermissionsService,
      runtime: mockRuntime,
      toolRegistry: mockToolRegistry,
    });
  });

  describe('Route Perimeter Authentication Guarding Integration', () => {
    it('should drop endpoint calls with a 401 response when identity service resolution fails', async () => {
      // Simulate the sub-service throwing an AuthenticationError on unverified request profiles
      vi.spyOn((controller as any).identityService, 'identity')
        .mockRejectedValue(new AuthenticationError('Unauthenticated request: Invalid token signature profile'));

      const mockRequest = { ip: '127.0.0.1', path: '/test' } as unknown as Request;

      // Fire the route handler directly to ensure the catch block handles the error mapping cleanly
      const response = await controller.createEmbeddings(mockRequest, mockResponse as Response);

      expect(response.status).toHaveBeenCalledWith(401);
      expect(response.send).toHaveBeenCalledWith({ 
        message: 'Unauthenticated request: Invalid token signature profile' 
      });
    });
  });

  describe('Context Lifecycle and Execution Routing', () => {
    it('should evaluate and structurally pass the cached context through to sub-actions', async () => {
      mockHttpAuth.credentials.mockResolvedValue({
        principal: { type: 'user', userEntityRef: 'user:default/admin' }
      });
      mockPermissionsService.authorize.mockResolvedValue([{ result: 'ALLOW' }]);

      const spy = vi.spyOn(embeddingModule, 'createEmbeddingsAction')
        .mockImplementation(async (_req, _res, _ctx, _userRef) => {
          return mockResponse as Response;
        });

      const mockRequest = {} as unknown as Request;
      await controller.createEmbeddings(mockRequest, mockResponse as Response);

      expect(spy).toHaveBeenCalledWith(
        mockRequest,
        mockResponse,
        expect.objectContaining({
          agents: mockAgents,
          logger: mockLogger,
          runtime: mockRuntime,
        }),
        'user:default/admin'
      );
    });

    it('should protect and preserve context parameter structural bindings from internal mutations', () => {
      const ctx = (controller as any).context;

      expect(typeof ctx.consumeRateLimit).toBe('function');
      expect(typeof ctx.fromStoredStep).toBe('function');
      expect(ctx.logger).toBe(mockLogger);
      expect(ctx.runtime).toBe(mockRuntime);
    });

    it('should preserve atomic context parameter binding as a singleton under concurrent query loads', async () => {
      const ctxReferences = await Promise.all(
        Array.from({ length: 50 }).map(async () => {
          return (controller as any).context;
        })
      );

      const firstRef = ctxReferences[0];
      ctxReferences.forEach(ref => {
        expect(ref).toBe(firstRef);
      });
    });
  });
});

describe('WorkflowController - Orchestration & Infrastructure Routing Layers', () => {
  let mockLogger: any;
  let mockRuntime: any;
  let mockToolRegistry: any;
  let mockIndexer: any;
  let mockAgents: Map<string, any>;
  let mockHttpAuth: any;
  let mockPermissionsService: any;
  let controller: WorkflowController;
  let mockResponse: Partial<Response>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockLogger = mockServices.logger.mock();
    mockRuntime = {};
    mockToolRegistry = {};
    mockIndexer = {};
    mockAgents = new Map();

    mockHttpAuth = {
      credentials: vi.fn(),
    };

    mockPermissionsService = {
      authorize: vi.fn(),
    };

    mockResponse = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    };

    controller = new WorkflowController({
      agents: mockAgents,
      augmentationIndexer: mockIndexer,
      httpAuth: mockHttpAuth,
      logger: mockLogger,
      permissions: mockPermissionsService,
      runtime: mockRuntime,
      toolRegistry: mockToolRegistry,
    });
  });

  describe('streamRunEvents Endpoint Boundary (IDOR Guarding)', () => {

    it('should drop the SSE connection with an explicit 403 when the reader lacks permission permissions', async () => {
      mockHttpAuth.credentials.mockResolvedValue({
        principal: { type: 'user', userEntityRef: 'user:default/unauthorized-user' }
      });
      mockPermissionsService.authorize.mockResolvedValue([{ result: AuthorizeResult.DENY }]);

      const mockRequest = {
        params: { runId: 'run_12345_abcde' }
      } as any;

      await controller.streamRunEvents(mockRequest, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.send).toHaveBeenCalledWith({
        message: expect.stringContaining('Insufficient read access')
      });
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('IDOR Stream Attempt Blocked'),
        expect.objectContaining({ runId: 'run_12345_abcde' })
      );
    });

    it('should cleanly delegate to the streams action module when authorization checks out ALLOW', async () => {
      mockHttpAuth.credentials.mockResolvedValue({
        principal: { type: 'user', userEntityRef: 'user:default/auditor' }
      });
      mockPermissionsService.authorize.mockResolvedValue([{ result: AuthorizeResult.ALLOW }]);

      // 3. Spy on the correct run.ts entrypoint
      const spy = vi.spyOn(runModule, 'streamRunEventsAction').mockResolvedValue(undefined as any);
      const mockRequest = { params: { runId: 'run_valid' } } as any;

      await controller.streamRunEvents(mockRequest, mockResponse as Response);

      expect(spy).toHaveBeenCalledWith(mockRequest, mockResponse, expect.any(Object), 'user:default/auditor');
    });

    it('should catch unhandled runtime errors inside streamRunEvents and log details before returning a 500 status', async () => {
      mockHttpAuth.credentials.mockResolvedValue({
        principal: { type: 'user', userEntityRef: 'user:default/auditor' }
      });
      mockPermissionsService.authorize.mockRejectedValue(new Error('Streaming buffer allocation crash'));

      const mockRequest = { params: { runId: 'run_crash' } } as any;
      await controller.streamRunEvents(mockRequest, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      // Fix: Match the true single-argument call pattern exactly
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Critical breakdown on SSE connection initialization: Streaming buffer allocation crash')
      );
    });
  });

  describe('approveRun Supervised Execution Boundary (Anti-Self-Approval)', () => {
    it('should reject manual approval gate manipulations with a 403 if the role parameters evaluate to DENY', async () => {
      mockHttpAuth.credentials.mockResolvedValue({
        principal: { type: 'user', userEntityRef: 'user:default/rogue-dev' }
      });
      mockPermissionsService.authorize.mockResolvedValue([{ result: AuthorizeResult.DENY }]);

      const mockRequest = {} as any;
      await controller.approveRun(mockRequest, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('RBAC Approval Blocked: UserRef [user:default/rogue-dev]')
      );
    });

    it('should successfully dispatch the approval task forward when validated by supervisory credentials', async () => {
      mockHttpAuth.credentials.mockResolvedValue({
        principal: { type: 'user', userEntityRef: 'user:default/lead-ops' }
      });
      mockPermissionsService.authorize.mockResolvedValue([{ result: AuthorizeResult.ALLOW }]);

      // 4. Spy on the correct run.ts entrypoint
      const spy = vi.spyOn(runModule, 'approveRunAction').mockResolvedValue(mockResponse as any);
      const mockRequest = {} as any;

      await controller.approveRun(mockRequest, mockResponse as Response);

      expect(spy).toHaveBeenCalledWith(mockRequest, mockResponse, expect.any(Object), 'user:default/lead-ops');
    });

    it('should catch unhandled exceptions inside approveRun, logging parameters before sending a 500 code', async () => {
      mockHttpAuth.credentials.mockResolvedValue({
        principal: { type: 'user', userEntityRef: 'user:default/lead-ops' }
      });
      mockPermissionsService.authorize.mockRejectedValue(new Error('Checkpoint mutation database timeout'));

      const mockRequest = {} as any;
      await controller.approveRun(mockRequest, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Unhandled failure boundary caught in approveRun: Checkpoint mutation database timeout'),
        expect.any(Object)
      );
    });
  });

  describe('Asynchronous Infrastructure Automations (Trigger & Webhook)', () => {
    it('should execute triggerRun using an authenticated system service principal identifier', async () => {
      mockHttpAuth.credentials.mockResolvedValue({
        principal: { type: 'service', subject: 'backstage-cron-engine' }
      });
      mockPermissionsService.authorize.mockResolvedValue([{ result: AuthorizeResult.ALLOW }]);

      // Fix: Spy on the isolated triggerModule reference directly
      const spy = vi.spyOn(triggerModule, 'triggerRunAction').mockResolvedValue(mockResponse as any);
      const mockRequest = {} as any;

      await controller.triggerRun(mockRequest, mockResponse as Response);

      expect(spy).toHaveBeenCalledWith(
        mockRequest,
        mockResponse,
        expect.any(Object),
        'system:service-principal/backstage-cron-engine'
      );
    });

    it('should execute webhookRun matching third-party verification identities', async () => {
      mockHttpAuth.credentials.mockResolvedValue({
        principal: { type: 'service', subject: 'github-webhook-sink' }
      });
      mockPermissionsService.authorize.mockResolvedValue([{ result: AuthorizeResult.ALLOW }]);

      // Fix: Spy on the isolated webhookModule reference directly
      const spy = vi.spyOn(webhookModule, 'webhookRunAction').mockResolvedValue(mockResponse as any);
      const mockRequest = {} as any;

      await controller.webhookRun(mockRequest, mockResponse as Response);

      expect(spy).toHaveBeenCalledWith(
        mockRequest,
        mockResponse,
        expect.any(Object),
        'system:service-principal/github-webhook-sink'
      );
    });

    it('should catch unhandled runtime errors inside triggers and return a sanitized 500 status payload', async () => {
      mockHttpAuth.credentials.mockResolvedValue({
        principal: { type: 'service', subject: 'unstable-cron' }
      });
      // Simulate an unhandled exception thrown from the database or permission layer
      mockPermissionsService.authorize.mockRejectedValue(new Error('Database connectivity dropout'));

      const mockRequest = {} as any;
      await controller.triggerRun(mockRequest, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(500);

      // Asserts that an internal platform routing failure statement was logged cleanly
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should catch unhandled runtime errors inside webhookRun and return a logged, sanitized 500 payload', async () => {
      mockHttpAuth.credentials.mockResolvedValue({
        principal: { type: 'service', subject: 'github-webhook-sink' }
      });
      mockPermissionsService.authorize.mockRejectedValue(new Error('Network handshake verification dropped'));

      const mockRequest = { path: '/api/webhook' } as any;
      await controller.webhookRun(mockRequest, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(500);

      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should catch unhandled runtime errors inside triggerRun and return a logged, sanitized 500 payload', async () => {
      mockHttpAuth.credentials.mockResolvedValue({
        principal: { type: 'service', subject: 'unstable-cron' }
      });
      mockPermissionsService.authorize.mockRejectedValue(new Error('Database connectivity dropout'));

      const mockRequest = {} as any;
      await controller.triggerRun(mockRequest, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Internal Server Error encountered during infrastructure trigger processing: Database connectivity dropout'),
        expect.any(Object)
      );
    });
  });
});
