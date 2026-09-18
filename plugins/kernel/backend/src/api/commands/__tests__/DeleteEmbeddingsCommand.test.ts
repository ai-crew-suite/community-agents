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
import { DeleteEmbeddingsCommand } from '../DeleteEmbeddingsCommand';
import { CommandContext, PackedRequestInput } from '../types/shared';
import { AugmentationIndexer } from '@ai-crew-suite/plugin-kernel-node';

describe('DeleteEmbeddingsCommand - Controlled Vector Erasure Boundary Suite', () => {
  let mockLogger: any;
  let mockPermissions: any;
  let mockIndexer: AugmentationIndexer;
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

    mockIndexer = {
      createEmbeddings: vi.fn(),
      deleteEmbeddings: vi.fn().mockResolvedValue(undefined),
      vectorStore: {} as any,
    };

    mockContext = {
      actorIdentity: 'user:default/ops-engineer',
      createdAt: new Date().toISOString(),
      logger: mockLogger,
    };

    mockCredentials = {} as unknown as BackstageCredentials;

    defaultInput = {
      params: {},
      query: {},
      body: {
        source: 'legacy-wiki-docs',
        entityFilter: { target: 'deprecated' },
      },
      headers: { authorization: 'Bearer token-signature' },
    };
  });

  it('should immediately raise a NotImplementedError if the core AugmentationIndexer layer is missing', async () => {
    const command = new DeleteEmbeddingsCommand({
      permissions: mockPermissions,
      hardening: {},
      credentials: mockCredentials,
    });

    await expect(command.execute(defaultInput, mockContext)).rejects.toThrow(NotImplementedError);
  });

  it('should immediately raise an InputError when the input data structural layout fails basic Zod validation', async () => {
    const command = new DeleteEmbeddingsCommand({
      permissions: mockPermissions,
      augmentationIndexer: mockIndexer,
      hardening: {},
      credentials: mockCredentials,
    });

    const brokenInput: PackedRequestInput = {
      ...defaultInput,
      body: {
        // Missing the required 'source' property field completely
        entityFilter: { group: 'engineering' },
      },
    };

    await expect(command.execute(brokenInput, mockContext)).rejects.toThrow(InputError);

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Schema Validation Rejection'),
      expect.any(Object)
    );
    expect(mockIndexer.deleteEmbeddings).not.toHaveBeenCalled();
  });

  it('should safely dispatch parameters to the indexer and return a successful payload block upon validation', async () => {
    const command = new DeleteEmbeddingsCommand({
      permissions: mockPermissions,
      augmentationIndexer: mockIndexer,
      hardening: {},
      credentials: mockCredentials,
    });

    const result = await command.execute(defaultInput, mockContext);

    expect(result).toEqual({
      response: 'Embeddings deleted for source legacy-wiki-docs',
    });
    expect(mockIndexer.deleteEmbeddings).toHaveBeenCalledWith('legacy-wiki-docs', { target: 'deprecated' });
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Initiating catalog data destruction routine'),
      expect.objectContaining({
        safeSource: 'legacy-wiki-docs',
        userRef: 'user:default/ops-engineer',
      })
    );
  });

  it('should intercept async data-layer crashes, execute critical error logging, and bubble up the exception', async () => {
    const command = new DeleteEmbeddingsCommand({
      permissions: mockPermissions,
      augmentationIndexer: mockIndexer,
      hardening: {},
      credentials: mockCredentials,
    });

    vi.mocked(mockIndexer.deleteEmbeddings).mockRejectedValueOnce(new Error('Database partition allocation breakdown'));

    await expect(command.execute(defaultInput, mockContext)).rejects.toThrow('Database partition allocation breakdown');

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Data Layer Mutative Erasure Failure'),
      expect.objectContaining({
        safeSource: 'legacy-wiki-docs',
        userRef: 'user:default/ops-engineer',
        errorMessage: 'Database partition allocation breakdown',
      })
    );
  });

  it('should explicitly throw a ConflictError when the data layer outputs a table deadlock exception', async () => {
    const command = new DeleteEmbeddingsCommand({
      permissions: mockPermissions,
      augmentationIndexer: mockIndexer,
      hardening: {},
      credentials: mockCredentials,
    });

    vi.mocked(mockIndexer.deleteEmbeddings).mockRejectedValueOnce(
      new Error('Transaction serialization error: concurrent index lock deadlock encountered')
    );

    await expect(command.execute(defaultInput, mockContext)).rejects.toThrow(ConflictError);

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Database Mutative Race Condition Caught'),
      expect.any(Object)
    );
  });

  it('should trigger a timeout rejection when the indexer call takes longer than the configured hardening limits', async () => {
    const lowTimeoutHardening = { timeoutMs: 1 };

    const command = new DeleteEmbeddingsCommand({
      permissions: mockPermissions,
      augmentationIndexer: mockIndexer,
      hardening: lowTimeoutHardening,
      credentials: mockCredentials,
    });

    vi.mocked(mockIndexer.deleteEmbeddings).mockImplementationOnce(() => new Promise(resolve => setTimeout(resolve, 5000)));

    await expect(command.execute(defaultInput, mockContext)).rejects.toThrow(
      'Vector data layer deletion task exceeded maximum configured timeout boundary'
    );
  });

  it('should throw an explicit system exception and log an error metric if the permissions service response payload is completely empty', async () => {
    mockPermissions.authorize.mockResolvedValue([]);

    const command = new DeleteEmbeddingsCommand({
      permissions: mockPermissions,
      augmentationIndexer: mockIndexer,
      hardening: {},
      credentials: mockCredentials,
    });

    await expect(command.execute(defaultInput, mockContext)).rejects.toThrow(
      'Internal authorization parsing failure encountered'
    );

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('RBAC critical evaluation failure: Authorization response payload was completely empty')
    );
    expect(mockIndexer.deleteEmbeddings).not.toHaveBeenCalled();
  });

  it('should reject requests with a NotAllowedError if the user is explicitly denied by RBAC profiles', async () => {
    mockPermissions.authorize.mockResolvedValue([{ result: 'DENY' }]);

    const command = new DeleteEmbeddingsCommand({
      permissions: mockPermissions,
      augmentationIndexer: mockIndexer,
      hardening: {},
      credentials: mockCredentials,
    });

    await expect(command.execute(defaultInput, mockContext)).rejects.toThrow(NotAllowedError);
    expect(mockIndexer.deleteEmbeddings).not.toHaveBeenCalled();
  });

  it('should successfully match and map uppercase or variation deadlock strings to a ConflictError safely', async () => {
    const command = new DeleteEmbeddingsCommand({
      permissions: mockPermissions,
      augmentationIndexer: mockIndexer,
      hardening: {},
      credentials: mockCredentials,
    });

    vi.mocked(mockIndexer.deleteEmbeddings).mockRejectedValueOnce(
      new Error('CRITICAL CLUSTER FAILURE: CONCURRENT TRANSACTION DEADLOCK OCCURRED')
    );

    // Store the execution promise so the production code only runs exactly once
    const executionPromise = command.execute(defaultInput, mockContext);

    // Verify both the error instance type and the explicit message contract cleanly
    await expect(executionPromise).rejects.toThrow(ConflictError);
    await expect(executionPromise).rejects.toThrow(
      "The embedding resource 'legacy-wiki-docs' is currently undergoing a structural update cycle. Please retry shortly."
    );

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Database Mutative Race Condition Caught'),
      expect.any(Object)
    );
  });

  it('should reject requests with an InputError if adversarial arrays are injected into the source string parameter field', async () => {
    const command = new DeleteEmbeddingsCommand({
      permissions: mockPermissions,
      augmentationIndexer: mockIndexer,
      hardening: {},
      credentials: mockCredentials,
    });

    const arrayFuzzInput: PackedRequestInput = {
      ...defaultInput,
      body: {
        // Force an array structure into an expected string field to trigger fuzzing exceptions
        source: ['docs-index', 'malicious-array-overflow-payload']
      }
    };

    // Verify it throws an InputError instead of crashing with a native javascript TypeError
    await expect(command.execute(arrayFuzzInput, mockContext)).rejects.toThrow(InputError);
    expect(mockIndexer.deleteEmbeddings).not.toHaveBeenCalled();
  });

  it('should verify that input validation drops register structured actor identity metadata inside the audit telemetry warning log', async () => {
    const command = new DeleteEmbeddingsCommand({
      permissions: mockPermissions,
      augmentationIndexer: mockIndexer,
      hardening: {},
      credentials: mockCredentials,
    })

    const invalidSchemaInput: PackedRequestInput = {
      ...defaultInput,
      body: {
        entityFilter: 'invalid-string-should-be-object-record'
      }
    };

    await expect(command.execute(invalidSchemaInput, mockContext)).rejects.toThrow(InputError);

    // Verify compliance audit metrics captured the user ref identity during the perimeter drop
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Schema Validation Rejection: Invalid data payload provided for embedding deletion'),
      expect.objectContaining({
        userRef: 'user:default/ops-engineer'
      })
    );
  });
});
