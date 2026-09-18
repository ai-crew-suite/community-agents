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
import { InputError, NotAllowedError, NotImplementedError } from '@backstage/errors';
import { BackstageCredentials } from '@backstage/backend-plugin-api';
import { GetEmbeddingsCommand, RetrievalPipeline } from '../GetEmbeddingsCommand';
import { CommandContext, PackedRequestInput } from '../types/shared';

describe('GetEmbeddingsCommand - Controlled Context Retrieval Boundary Suite', () => {
  let mockLogger: any;
  let mockPermissions: any;
  let mockPipeline: RetrievalPipeline;
  let mockContext: CommandContext;
  let mockCredentials: BackstageCredentials;
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

    mockPipeline = {
      retrieveAugmentationContext: vi.fn().mockResolvedValue(['chunk_1', 'chunk_2']),
    };

    mockContext = {
      actorIdentity: 'user:default/auditor-staff',
      createdAt: new Date().toISOString(),
      logger: mockLogger,
    };

    mockCredentials = {} as unknown as BackstageCredentials;

    defaultInput = {
      params: {},
      query: {
        query: 'How to configure OTel distributed metrics tracking?',
        source: 'engineering-playbook',
        entityFilter: undefined,
      },
      body: {},
      headers: { authorization: 'Bearer token-sig' },
    };
  });

  it('should immediately raise a NotImplementedError if the core RetrievalPipeline layer is missing', async () => {
    const command = new GetEmbeddingsCommand(mockPermissions, undefined, {}, mockCredentials);
    await expect(command.execute(defaultInput, mockContext)).rejects.toThrow(NotImplementedError);
  });

  it('should immediately raise an InputError when the query parameter mapping fails Zod schema verification', async () => {
    const command = new GetEmbeddingsCommand(mockPermissions, mockPipeline, {}, mockCredentials);

    const brokenInput: PackedRequestInput = {
      ...defaultInput,
      query: {
        // Missing the required 'query' parameter field completely
        source: 'confluence-kb',
      },
    };

    await expect(command.execute(brokenInput, mockContext)).rejects.toThrow(InputError);

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Schema Validation Rejection'),
      expect.any(Object)
    );
    expect(mockPipeline.retrieveAugmentationContext).not.toHaveBeenCalled();
  });

  it('should forward parameters cleanly to the pipeline service and return context results on valid inputs', async () => {
    const command = new GetEmbeddingsCommand(mockPermissions, mockPipeline, {}, mockCredentials);

    const result = await command.execute(defaultInput, mockContext);

    expect(result).toEqual({ results: ['chunk_1', 'chunk_2'] });
    expect(mockPipeline.retrieveAugmentationContext).toHaveBeenCalledWith(
      'How to configure OTel distributed metrics tracking?',
      'engineering-playbook',
      undefined
    );
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('Executing semantic context augmentation query retrieval'),
      expect.objectContaining({
        safeSource: 'engineering-playbook',
        userRef: 'user:default/auditor-staff',
        queryLength: 51,
      })
    );
  });

  it('should catch async read anomalies, log context fields safely, and mask the public error exception', async () => {
    const command = new GetEmbeddingsCommand(mockPermissions, mockPipeline, {}, mockCredentials);

    vi.mocked(mockPipeline.retrieveAugmentationContext).mockRejectedValueOnce(
      new Error('Vector embedding index pointer corrupted')
    );

    const executionPromise = command.execute(defaultInput, mockContext);

    await expect(executionPromise).rejects.toThrow(
      'An internal data layer exception blocked vector retrieval execution profiles.'
    );

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Data Layer Read Retrieval Failure'),
      expect.objectContaining({
        safeSource: 'engineering-playbook',
        userRef: 'user:default/auditor-staff',
        internalError: 'Vector embedding index pointer corrupted',
      })
    );
  });

  it('should trigger a timeout rejection when the retrieval pipeline takes longer than configured hardening boundaries', async () => {
    const lowTimeoutHardening = { timeoutMs: 1 };
    const command = new GetEmbeddingsCommand(mockPermissions, mockPipeline, lowTimeoutHardening, mockCredentials);

    vi.mocked(mockPipeline.retrieveAugmentationContext).mockImplementationOnce(
      () => new Promise(resolve => setTimeout(resolve, 5000))
    );

    await expect(command.execute(defaultInput, mockContext)).rejects.toThrow(
      'Vector data layer retrieval task exceeded maximum configured timeout boundary'
    );
  });

  it('should sanitize raw infrastructure exceptions to prevent data layout leakage', async () => {
    const command = new GetEmbeddingsCommand(mockPermissions, mockPipeline, {}, mockCredentials);

    vi.mocked(mockPipeline.retrieveAugmentationContext).mockRejectedValueOnce(
      new Error('FATAL: Internal PostgreSQL connection pooling slot exhaust limit reached [Cluster Topology: 10.0.1.5]')
    );

    const executionPromise = command.execute(defaultInput, mockContext);

    await expect(executionPromise).rejects.toThrow(Error);
    await expect(executionPromise).rejects.toThrow(
      'An internal data layer exception blocked vector retrieval execution profiles.'
    );
  });

  it('should successfully handle whitespace padding mutations on search queries without shifting index tracks', async () => {
    const command = new GetEmbeddingsCommand(mockPermissions, mockPipeline, {}, mockCredentials);

    const trailingWhitespaceInput: PackedRequestInput = {
      ...defaultInput,
      query: {
        query: '   Clean architecture standards mapping    ',
        source: 'confluence-kb',
      },
    };

    await command.execute(trailingWhitespaceInput, mockContext);

    expect(mockPipeline.retrieveAugmentationContext).toHaveBeenCalledWith(
      'Clean architecture standards mapping',
      'confluence-kb',
      undefined
    );
  });

  it('should throw an explicit system exception and log an error metric if the permissions service response payload is completely empty', async () => {
    mockPermissions.authorize.mockResolvedValue([]);
    const command = new GetEmbeddingsCommand(mockPermissions, mockPipeline, {}, mockCredentials);

    await expect(command.execute(defaultInput, mockContext)).rejects.toThrow(
      'Internal authorization parsing failure encountered'
    );

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('RBAC critical evaluation failure: Authorization response payload was completely empty')
    );
    expect(mockPipeline.retrieveAugmentationContext).not.toHaveBeenCalled();
  });

  it('should reject requests with a NotAllowedError if the user is explicitly denied by RBAC profiles', async () => {
    mockPermissions.authorize.mockResolvedValue([{ result: 'DENY' }]);
    const command = new GetEmbeddingsCommand(mockPermissions, mockPipeline, {}, mockCredentials);

    await expect(command.execute(defaultInput, mockContext)).rejects.toThrow(NotAllowedError);
    expect(mockPipeline.retrieveAugmentationContext).not.toHaveBeenCalled();
  });

  it('should cleanly reject query parameters containing adversarial array injections with an InputError', async () => {
    const command = new GetEmbeddingsCommand(mockPermissions, mockPipeline, {}, mockCredentials);

    const arrayQueryFuzzInput: PackedRequestInput = {
      ...defaultInput,
      query: {
        // Force an array structure into an expected string field to trigger fuzzing exceptions
        query: ['Fetch identity schemas', 'Malicious trailing array query token override'],
        source: 'engineering-playbook'
      }
    };

    // Verify it drops gracefully via an InputError instead of throwing an unhandled TypeError
    await expect(command.execute(arrayQueryFuzzInput, mockContext)).rejects.toThrow(InputError);
    expect(mockPipeline.retrieveAugmentationContext).not.toHaveBeenCalled();
  });

  it('should safely normalize telemetry logs even if the vector pipeline returns a null or corrupt structural payload result', async () => {
    const command = new GetEmbeddingsCommand(mockPermissions, mockPipeline, {}, mockCredentials);

    // Simulate a database returning a corrupt null payload instance instead of an array
    vi.mocked(mockPipeline.retrieveAugmentationContext).mockResolvedValueOnce(null);

    const result = await command.execute(defaultInput, mockContext);

    // Verify execution resolves cleanly without property read crashes
    expect(result).toEqual({ results: null });
    // Confirm logging fallback logic handled the scalar extraction check correctly
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('Successfully compiled knowledge catalog semantic context arrays'),
      expect.objectContaining({
        recordsExtracted: 1
      })
    );
  });

});
