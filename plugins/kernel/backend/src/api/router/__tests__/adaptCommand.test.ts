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
import { Request, Response, NextFunction } from 'express';
import { NotAllowedError } from '@backstage/errors';
import { BackstageCredentials, HttpAuthService } from '@backstage/backend-plugin-api';
import { adaptCommand, AdapterDependencies } from '../adaptCommand';
import {
  CommandContext,
  PackedRequestInput,
  StreamExecutionFunction,
} from '../../commands/types/shared';

describe('adaptCommand - Security Perimeter Adapter Blueprint Suite', () => {
  let mockLogger: any;
  let mockHttpAuth: any;
  let mockPermissions: any;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;
  let mockCommandInstance: any;
  let FakeCommandClass: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      child: vi.fn().mockReturnThis(),
    };

    mockHttpAuth = {
      credentials: vi.fn(),
    } as unknown as HttpAuthService;

    mockPermissions = {
      authorize: vi.fn(),
    };

    mockResponse = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      headersSent: false,
    };

    mockNext = vi.fn();

    mockCommandInstance = {
      execute: vi.fn().mockResolvedValue({ success: true }),
    };

    // Greenfield Fix: Use traditional function expression instead of arrow syntax to support constructor lifecycle
    FakeCommandClass = vi.fn().mockImplementation(function() {
      return mockCommandInstance;
    });
  });

  it('should immediately intercept execution paths and pass a NotAllowedError to middleware if principal credentials fail to resolve', async () => {
    const dependencies: AdapterDependencies = {
      logger: mockLogger,
      httpAuth: mockHttpAuth,
    };

    mockHttpAuth.credentials.mockResolvedValue(undefined);

    const req = {
      body: {},
      query: {},
      params: {},
      headers: {},
    } as unknown as Request;

    const middleware = adaptCommand(FakeCommandClass, dependencies, [mockPermissions]);
    await middleware(req, mockResponse as Response, mockNext);

    expect(FakeCommandClass).not.toHaveBeenCalled();
    expect(mockNext).toHaveBeenCalledWith(expect.any(NotAllowedError));
    expect(mockNext).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Access Denied: Missing valid Backstage authentication principal.',
      })
    );
  });

  it('should securely narrow a human User Principal token and map its userEntityRef to the immutable command context object payload', async () => {
    const dependencies: AdapterDependencies = {
      logger: mockLogger,
      httpAuth: mockHttpAuth,
    };

    const mockCredentials = {
      principal: {
        userEntityRef: 'user:default/kevin',
      },
    } as unknown as BackstageCredentials;

    mockHttpAuth.credentials.mockResolvedValue(mockCredentials);

    const req = {
      body: { query: 'Execute sequence' },
      query: {},
      params: {},
      headers: { authorization: 'Bearer user-token' },
    } as unknown as Request;

    const middleware = adaptCommand(FakeCommandClass, dependencies, [mockPermissions]);
    await middleware(req, mockResponse as Response, mockNext);

    expect(FakeCommandClass).toHaveBeenCalledWith(mockPermissions, mockCredentials);

    expect(mockCommandInstance.execute).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        actorIdentity: 'user:default/kevin',
      })
    );
    expect(mockResponse.status).toHaveBeenCalledWith(200);
  });

  it('should successfully narrow an automated Service Principal identity tracking its subject property natively', async () => {
    const dependencies: AdapterDependencies = {
      logger: mockLogger,
      httpAuth: mockHttpAuth,
    };

    const mockCredentials = {
      principal: {
        subject: 'system:service-principal/cron-scheduler-job',
      },
    } as unknown as BackstageCredentials;

    mockHttpAuth.credentials.mockResolvedValue(mockCredentials);

    const req = {
      body: {},
      query: {},
      params: {},
      headers: { 'backstage-ajax-token': 'service-token' },
    } as unknown as Request;

    const middleware = adaptCommand(FakeCommandClass, dependencies, [mockPermissions]);
    await middleware(req, mockResponse as Response, mockNext);

    expect(mockCommandInstance.execute).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        actorIdentity: 'system:service-principal/cron-scheduler-job',
      })
    );
  });

  it('should actively reject malformed or opaque principal structures that lack userEntityRef or subject keys', async () => {
    const dependencies: AdapterDependencies = { logger: mockLogger, httpAuth: mockHttpAuth };
    // Pass an authenticated principal that lacks compliant tracking fields entirely
    const mockCorruptedCredentials = { principal: { corporateRole: 'unverified-external-auditor' } } as unknown as BackstageCredentials;
    mockHttpAuth.credentials.mockResolvedValue(mockCorruptedCredentials);

    const req = { body: {}, query: {}, params: {}, headers: { authorization: 'Bearer anomaly-token' } } as unknown as Request;

    const middleware = adaptCommand(FakeCommandClass, dependencies, [mockPermissions]);
    await middleware(req, mockResponse as Response, mockNext);

    expect(FakeCommandClass).not.toHaveBeenCalled();
    expect(mockNext).toHaveBeenCalledWith(expect.any(NotAllowedError));
    expect(mockNext).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('Non-repudiation contract breach') })
    );
  });

  it('should safely allow downstream streaming execution functions to throw errors and propagate them natively to error middleware', async () => {
    const dependencies: AdapterDependencies = { logger: mockLogger, httpAuth: mockHttpAuth };
    const mockCredentials = { principal: { userEntityRef: 'user:default/lead-engineer' } } as unknown as BackstageCredentials;
    mockHttpAuth.credentials.mockResolvedValue(mockCredentials);

    // Mock the command to return a lazy stream execution function that explodes mid-stream
    const mockExplodingStream: StreamExecutionFunction = async (_res) => {
      throw new Error('SSE Pipeline Severed: Connection reset by remote corporate proxy gateway.');
    };
    mockCommandInstance.execute.mockResolvedValue(mockExplodingStream);

    const req = { body: {}, query: {}, params: {}, headers: { authorization: 'Bearer stream-token' } } as unknown as Request;

    const middleware = adaptCommand(FakeCommandClass, dependencies, [mockPermissions]);
    await middleware(req, mockResponse as Response, mockNext);

    // Verify the stream failure bubbled directly out to Express error middleware for trace mapping
    expect(mockNext).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'SSE Pipeline Severed: Connection reset by remote corporate proxy gateway.' })
    );
  });

  it('should securely fall back to pristine empty record definitions if raw ingress container segments arrive undefined', async () => {
    const dependencies: AdapterDependencies = { logger: mockLogger, httpAuth: mockHttpAuth };
    const mockCredentials = { principal: { subject: 'system:service-principal/gateway' } } as unknown as BackstageCredentials;
    mockHttpAuth.credentials.mockResolvedValue(mockCredentials);

    // Force an environment state where properties are missing from the request container completely
    const nakedRequest = {
      headers: { authorization: 'Bearer naked-token' },
      body: undefined,
      query: undefined,
      params: undefined,
    } as unknown as Request;

    const middleware = adaptCommand(FakeCommandClass, dependencies, [mockPermissions]);
    await middleware(nakedRequest, mockResponse as Response, mockNext);

    // Verify that extraction did not crash and passed clean initialized object records forward
    expect(mockCommandInstance.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.any(Object),
        query: expect.any(Object),
        params: expect.any(Object),
      }),
      expect.any(Object)
    );
  });

  it('should insulate the context execution loop from adversarial prototype pollution overrides', async () => {
    const dependencies: AdapterDependencies = { logger: mockLogger, httpAuth: mockHttpAuth };
    const mockCredentials = { principal: { userEntityRef: 'user:default/security-analyst' } } as unknown as BackstageCredentials;
    mockHttpAuth.credentials.mockResolvedValue(mockCredentials);

    const poisonedRequest = {
      headers: { authorization: 'Bearer protection-token' },
      body: { __proto__: { corruptedProperty: 'hijacked' } },
      query: {},
      params: {},
    } as unknown as Request;

    const middleware = adaptCommand(FakeCommandClass, dependencies, [mockPermissions]);
    await middleware(poisonedRequest, mockResponse as Response, mockNext);

    // Greenfield Fix: Map the call mock history array safely through a typed record layout to satisfy strict index signatures
    const calls = mockCommandInstance.execute.mock.calls as [PackedRequestInput, CommandContext][];
    const firstCallArgs = calls[0]?.[0];

    // Use an explicit string lookup record mapping to bypass strict property checks natively
    const bodyPayload = firstCallArgs?.body as Record<string, unknown>;
    expect(bodyPayload['corruptedProperty']).toBeUndefined();
  });

  it('should safely preserve multi-value or array parameter configurations inside the ingress headers map payload', async () => {
    const dependencies: AdapterDependencies = { logger: mockLogger, httpAuth: mockHttpAuth };
    const mockCredentials = { principal: { userEntityRef: 'user:default/admin' } } as unknown as BackstageCredentials;
    mockHttpAuth.credentials.mockResolvedValue(mockCredentials);

    const req = {
      body: {},
      query: {},
      params: {},
      headers: {
        authorization: 'Bearer tracking-token',
        // Simulate an multi-hop corporate load balancer configuration payload pass
        'x-forwarded-for': ['192.168.1.100', '10.0.4.5'],
      },
    } as unknown as Request;

    const middleware = adaptCommand(FakeCommandClass, dependencies, [mockPermissions]);
    await middleware(req, mockResponse as Response, mockNext);

    expect(mockCommandInstance.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-forwarded-for': expect.arrayContaining(['192.168.1.100', '10.0.4.5']),
        }),
      }),
      expect.any(Object)
    );
  });

  it('should successfully capture immediate synchronous constructor exceptions and forward them to central framework error handlers', async () => {
    const dependencies: AdapterDependencies = { logger: mockLogger, httpAuth: mockHttpAuth };
    const mockCredentials = { principal: { userEntityRef: 'user:default/developer' } } as unknown as BackstageCredentials;
    mockHttpAuth.credentials.mockResolvedValue(mockCredentials);

    // Simulate a catastrophic developer code exception during structural constructor initialization lines
    FakeCommandClass.mockImplementation(function() {
      throw new TypeError('CRITICAL: Failed to compile target command factory memory registers.');
    });

    const req = { body: {}, query: {}, params: {}, headers: { authorization: 'Bearer crash-token' } } as unknown as Request;

    const middleware = adaptCommand(FakeCommandClass, dependencies, [mockPermissions]);
    await middleware(req, mockResponse as Response, mockNext);

    expect(mockNext).toHaveBeenCalledWith(expect.any(TypeError));
    expect(mockNext).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'CRITICAL: Failed to compile target command factory memory registers.',
      })
    );
  });

  it('should treat an empty string identity property inside principal structures as an absolute authorization breach', async () => {
    const dependencies: AdapterDependencies = { logger: mockLogger, httpAuth: mockHttpAuth };
    // Inject a fuzz payload containing an empty string identity key mapping indicator
    const mockEmptyCredentials = { principal: { userEntityRef: '' } } as unknown as BackstageCredentials;
    mockHttpAuth.credentials.mockResolvedValue(mockEmptyCredentials);

    const req = { body: {}, query: {}, params: {}, headers: { authorization: 'Bearer fuzz-token' } } as unknown as Request;

    const middleware = adaptCommand(FakeCommandClass, dependencies, [mockPermissions]);
    await middleware(req, mockResponse as Response, mockNext);

    expect(FakeCommandClass).not.toHaveBeenCalled();
    expect(mockNext).toHaveBeenCalledWith(expect.any(NotAllowedError));
    expect(mockNext).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Access Denied: Non-repudiation contract breach. Invalid actor identity serialization.',
      })
    );
  });

});
