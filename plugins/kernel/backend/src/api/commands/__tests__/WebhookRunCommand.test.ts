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
// plugins/kernel/backend/src/api/commands/__tests__/WebhookRunCommand.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InputError, NotAllowedError, NotImplementedError } from '@backstage/errors';
import { BackstageCredentials } from '@backstage/backend-plugin-api';
import { WebhookRunCommand, WebhookRuntimeEngine } from '../WebhookRunCommand';
import { CommandContext, PackedRequestInput } from '../types';
import { TriggerBinding } from '@ai-crew-suite/plugin-kernel-node';

describe('WebhookRunCommand - Controlled Third-Party Webhook Ingestion Boundary Suite', () => {
  let mockLogger: any;
  let mockPermissions: any;
  let mockRuntime: WebhookRuntimeEngine;
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
        yield { type: 'done', data: { runId: 'run_valid' } };
      }),
    };

    mockTriggersList = [
      { id: 'github-pr-closed', source: 'github', agentId: 'webhook-handler-agent' },
    ];

    mockAgentsMap = new Map([['webhook-handler-agent', { id: 'webhook-handler-agent' }]]);

    mockContext = {
      actorIdentity: 'system:service-principal/github-gateway',
      createdAt: new Date().toISOString(),
      logger: mockLogger,
    };

    mockCredentials = {} as unknown as BackstageCredentials;

    defaultInput = {
      params: { provider: 'github' },
      body: { triggerId: 'github-pr-closed', query: 'Deploying engineering-service artifact updates' },
      query: {},
      headers: { 'content-length': '150', authorization: 'Bearer token' },
    };
  });

  it('should immediately raise a NotImplementedError if a core sub-system registry dependency is missing', async () => {
    const command = new WebhookRunCommand(mockPermissions, undefined, mockTriggersList, mockAgentsMap, {}, mockCredentials);
    await expect(command.execute(defaultInput, mockContext)).rejects.toThrow(NotImplementedError);
  });

  it('should immediately raise an InputError if validation fields fail Zod parsing contracts', async () => {
    const command = new WebhookRunCommand(mockPermissions, mockRuntime, mockTriggersList, mockAgentsMap, {}, mockCredentials);

    const brokenInput: PackedRequestInput = {
      ...defaultInput,
      params: { provider: '' },
      body: {},
    };

    await expect(command.execute(brokenInput, mockContext)).rejects.toThrow(InputError);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Webhook Validation Drop'),
      expect.any(Object)
    );
  });

  it('should throw an explicit InputError if no active rule maps to provider parameter combinations', async () => {
    const command = new WebhookRunCommand(mockPermissions, mockRuntime, mockTriggersList, mockAgentsMap, {}, mockCredentials);

    const unmappedInput: PackedRequestInput = {
      ...defaultInput,
      params: { provider: 'gitlab' }, // Rule registry only covers 'github'
    };

    await expect(command.execute(unmappedInput, mockContext)).rejects.toThrow(InputError);
  });

  it('should throw an InputError and bypass execution loops when encountering a Ghost Agent mapping reference', async () => {
    const emptyAgentsMap = new Map<string, unknown>();
    const command = new WebhookRunCommand(mockPermissions, mockRuntime, mockTriggersList, emptyAgentsMap, {}, mockCredentials);

    await expect(command.execute(defaultInput, mockContext)).rejects.toThrow(InputError);
    expect(mockRuntime.run).not.toHaveBeenCalled();
  });

  it('should pass parameters forward, verify identity bounds, and capture async done event streams completely', async () => {
    const command = new WebhookRunCommand(mockPermissions, mockRuntime, mockTriggersList, mockAgentsMap, {}, mockCredentials);

    const result = await command.execute(defaultInput, mockContext);

    expect(result.status).toBe('webhook_processing_dispatched');
    expect(result.runId).toBeDefined();

    expect(mockRuntime.run).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: 'webhook-handler-agent', trigger: 'webhook-github' }),
      expect.objectContaining({ identity: 'system:service-principal/github-gateway' })
    );

    // Wait for the asynchronous background iterable thread loop to resolve completely
    await new Promise(resolve => setImmediate(resolve));

    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('Webhook orchestrated agent run thread successfully completed task actions'),
      expect.objectContaining({ provider: 'github', userRef: 'system:service-principal/github-gateway' })
    );
  });

  it('should successfully strip out special characters from injection-prone webhook parameters before matching bindings', async () => {
    const command = new WebhookRunCommand(mockPermissions, mockRuntime, mockTriggersList, mockAgentsMap, {}, mockCredentials);

    const maliciousInput: PackedRequestInput = {
      ...defaultInput,
      params: { provider: 'github/../traversal-attempt' }, // Malicious injection format
      body: { triggerId: 'github-pr-closed!!', query: 'Process payload safely' },
    };

    // Alphanumeric cleanup will map values to 'githubtraversal-attempt' and 'github-pr-closed', triggering an expected InputError
    await expect(command.execute(maliciousInput, mockContext)).rejects.toThrow(InputError);

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Webhook invocation ignored: Provider mapping target has no matching configuration rules'),
      expect.objectContaining({
        provider: 'githubtraversal-attempt', // Verifies alphanumeric sanitization pass
        triggerId: 'github-pr-closed',       // Verifies alphanumeric sanitization pass
      })
    );
  });

  it('should fall back to calculate request size from the body literal when Content-Length headers are completely missing', async () => {
    const command = new WebhookRunCommand(mockPermissions, mockRuntime, mockTriggersList, mockAgentsMap, {}, mockCredentials);

    const bareInput: PackedRequestInput = {
      ...defaultInput,
      headers: {}, // Omitted header scenario
    };

    const result = await command.execute(bareInput, mockContext);
    expect(result.status).toBe('webhook_processing_dispatched');

    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('Authorized external webhook alert originating from provider boundary'),
      expect.objectContaining({
        payloadSizeBytes: expect.any(Number),
      })
    );
  });

  it('should deploy defensive default objects when the background loop handles a null error token exception', async () => {
    const command = new WebhookRunCommand(mockPermissions, mockRuntime, mockTriggersList, mockAgentsMap, {}, mockCredentials);

    // Simulate an immediate async loop crash by throwing a raw null primitive
    vi.mocked(mockRuntime.run).mockImplementationOnce(() => {
      throw null;
    });

    const result = await command.execute(defaultInput, mockContext);
    expect(result.status).toBe('webhook_processing_dispatched');

    await new Promise(resolve => setImmediate(resolve));

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Fatal background loop system processing crack encountered on webhook run tracker'),
      expect.objectContaining({
        errorName: 'Error',
        errorMessage: 'Opaque un-handled microtask worker thread exception',
      })
    );
  });

  it('should successfully handle query payloads containing whitespace padding mutations without shifting mapping tracks', async () => {
    const command = new WebhookRunCommand(mockPermissions, mockRuntime, mockTriggersList, mockAgentsMap, {}, mockCredentials);

    const paddedInput: PackedRequestInput = {
      ...defaultInput,
      body: {
        triggerId: 'github-pr-closed',
        query: '   Trigger text payload containing loose trailing tabs \n   ',
      },
    };

    await command.execute(paddedInput, mockContext);

    expect(mockRuntime.run).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          query: 'Trigger text payload containing loose trailing tabs',
        }),
      }),
      expect.any(Object)
    );
  });

  it('should throw an explicit system exception and log an error metric if the permissions service response payload is completely empty', async () => {
    mockPermissions.authorize.mockResolvedValue([]);
    const command = new WebhookRunCommand(mockPermissions, mockRuntime, mockTriggersList, mockAgentsMap, {}, mockCredentials);

    await expect(command.execute(defaultInput, mockContext)).rejects.toThrow(
      'Internal authorization parsing failure encountered'
    );

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('RBAC critical evaluation failure: Authorization response payload was completely empty')
    );
    expect(mockRuntime.run).not.toHaveBeenCalled();
  });

  it('should reject requests with a NotAllowedError if the webhook integration target is explicitly denied by RBAC profiles', async () => {
    mockPermissions.authorize.mockResolvedValue([{ result: 'DENY' }]);
    const command = new WebhookRunCommand(mockPermissions, mockRuntime, mockTriggersList, mockAgentsMap, {}, mockCredentials);

    await expect(command.execute(defaultInput, mockContext)).rejects.toThrow(NotAllowedError);
    expect(mockRuntime.run).not.toHaveBeenCalled();
  });

  it('should safely fall back to calculating body length if the Content-Length header contains an illegal non-numeric string', async () => {
    const command = new WebhookRunCommand(mockPermissions, mockRuntime, mockTriggersList, mockAgentsMap, {}, mockCredentials);

    const corruptedHeaderInput: PackedRequestInput = {
      ...defaultInput,
      headers: {
        authorization: 'Bearer token-ref',
        // Pass a corrupted non-numeric string format to trigger fallback conditions
        'content-length': '150-bytes-overflow'
      }
    };

    const result = await command.execute(corruptedHeaderInput, mockContext);
    expect(result.status).toBe('webhook_processing_dispatched');

    // Verify completion log parsed a safe fallback numerical metric scalar
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('Authorized external webhook alert originating from provider boundary'),
      expect.objectContaining({
        payloadSizeBytes: expect.any(Number)
      })
    );
  });
});