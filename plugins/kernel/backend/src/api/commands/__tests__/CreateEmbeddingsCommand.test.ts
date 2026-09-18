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
import { AugmentationIndexer } from '@ai-crew-suite/plugin-kernel-node';
import { CreateEmbeddingsCommand } from '../CreateEmbeddingsCommand';
import { CommandContext, PackedRequestInput } from '../types/shared';

describe('CreateEmbeddingsCommand - Embedded Knowledge Integration Module Suite', () => {
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
      // Returns explicit mock count value to pass typed return expectations
      createEmbeddings: vi.fn().mockResolvedValue(42),
      deleteEmbeddings: vi.fn().mockResolvedValue(undefined),
      vectorStore: {} as any,
    };


    mockContext = {
      actorIdentity: 'user:default/kevin',
      createdAt: new Date().toISOString(),
      logger: mockLogger,
    };

    mockCredentials = {} as unknown as BackstageCredentials;

    defaultInput = {
      params: {},
      query: {},
      body: {
        query: 'Analyze software template configurations for security policies',
        source: 'backstage-docs-catalog',
        entityFilter: {},
      },
      headers: { authorization: 'Bearer token-ref' },
    };
  });

  it('should immediately raise an InputError if the core AugmentationIndexer layer is missing', async () => {
    const command = new CreateEmbeddingsCommand({
      permissions: mockPermissions,
      credentials: mockCredentials,
    });

    await expect(command.execute(defaultInput, mockContext)).rejects.toThrow(NotImplementedError);
  });

  it('should immediately raise a standard InputError when provided an invalid empty payload request structure', async () => {
    const command = new CreateEmbeddingsCommand({
      permissions: mockPermissions,
      augmentationIndexer: mockIndexer,
      credentials: mockCredentials,
    });

    const malformedInput: PackedRequestInput = {
      ...defaultInput,
      body: {
        // Missing required 'query' and 'source' field arguments completely
        entityFilter: 'component:default/test-service',
      },
    };

    await expect(command.execute(malformedInput, mockContext)).rejects.toThrow(InputError);

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Schema Validation Rejection'),
      expect.any(Object)
    );
    expect(mockIndexer.createEmbeddings).not.toHaveBeenCalled();
  });

  it('should forward structured parameters down to the indexing service and acknowledge on valid inputs', async () => {
    const command = new CreateEmbeddingsCommand({
      permissions: mockPermissions,
      augmentationIndexer: mockIndexer,
      credentials: mockCredentials,
    });

    const result = await command.execute(defaultInput, mockContext);

    expect(result).toEqual({
      response: 'Embeddings created for source backstage-docs-catalog',
      count: 42,
    });
    expect(mockIndexer.createEmbeddings).toHaveBeenCalledWith(
      'backstage-docs-catalog',
      expect.any(Object)
    );
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('Executing catalog knowledge vector indexing injection loop'),
      expect.objectContaining({
        safeSource: 'backstage-docs-catalog',
        userRef: 'user:default/kevin',
      })
    );
  });

  it('should normalize blank or whitespace-only source parameters to "all" and execute safely', async () => {
    const command = new CreateEmbeddingsCommand({
      permissions: mockPermissions,
      augmentationIndexer: mockIndexer,
      credentials: mockCredentials,
    });

    const emptySourceInput: PackedRequestInput = {
      ...defaultInput,
      body: {
        query: 'Verify baseline compliance parameters mapping schemas',
        source: '   ',
        entityFilter: {},
      },
    };

    const result = await command.execute(emptySourceInput, mockContext);

    expect(result).toEqual({
      response: 'Embeddings created for source all',
      count: 42,
    });
    expect(mockIndexer.createEmbeddings).toHaveBeenCalledWith('all', expect.any(Object));
  });

  it('should safely slice massive query strings into logging snippets without buffer exhaustion anomalies', async () => {
    const command = new CreateEmbeddingsCommand({
      permissions: mockPermissions,
      augmentationIndexer: mockIndexer,
      credentials: mockCredentials,
    });
    const massiveQuery = 'A'.repeat(5000); // 5KB massive token payload block injection

    const highThroughputInput: PackedRequestInput = {
      ...defaultInput,
      body: {
        query: massiveQuery,
        source: 'large-scale-corpus',
        entityFilter: {},
      },
    };

    await command.execute(highThroughputInput, mockContext);

    // Verify completion log safely truncates the string to protect tracking limits
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('Successfully synchronized catalog vector data boundaries'),
      expect.objectContaining({
        querySnippet: 'A'.repeat(30), // Checks exact 30-character boundary limits
      })
    );
  });

  it('should throw an explicit system exception and log an error metric if the permissions service response payload is completely empty', async () => {
    mockPermissions.authorize.mockResolvedValue([]);
    const command = new CreateEmbeddingsCommand({
      permissions: mockPermissions,
      augmentationIndexer: mockIndexer,
      credentials: mockCredentials,
    });

    await expect(command.execute(defaultInput, mockContext)).rejects.toThrow(
      'Internal authorization parsing failure encountered'
    );

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('RBAC critical evaluation failure: Authorization response payload was completely empty')
    );
    expect(mockIndexer.createEmbeddings).not.toHaveBeenCalled();
  });

  it('should reject requests with a NotAllowedError if the user is explicitly denied by RBAC profiles', async () => {
    mockPermissions.authorize.mockResolvedValue([{ result: 'DENY' }]);

    const command = new CreateEmbeddingsCommand({
      permissions: mockPermissions,
      augmentationIndexer: mockIndexer,
      credentials: mockCredentials,
    });

    await expect(command.execute(defaultInput, mockContext)).rejects.toThrow(NotAllowedError);
    expect(mockIndexer.createEmbeddings).not.toHaveBeenCalled();
  });

  it('should successfully handle requests when the optional entityFilter property is completely absent', async () => {
    const command = new CreateEmbeddingsCommand({
      permissions: mockPermissions,
      augmentationIndexer: mockIndexer,
      credentials: mockCredentials,
    });

    const minimalistInput: PackedRequestInput = {
      ...defaultInput,
      body: {
        query: 'Execute standard validation check',
        source: 'minimalist-source-ref'
      }
    };

    const result = await command.execute(minimalistInput, mockContext);
    expect(result.response).toBe('Embeddings created for source minimalist-source-ref');
    expect(mockIndexer.createEmbeddings).toHaveBeenCalledWith('minimalist-source-ref', undefined);
  });

  it('should raise an InputError if the query parameter consists entirely of empty whitespace characters', async () => {
    const command = new CreateEmbeddingsCommand({
      permissions: mockPermissions,
      augmentationIndexer: mockIndexer,
      credentials: mockCredentials,
    });

    const emptyQueryInput: PackedRequestInput = {
      ...defaultInput,
      body: {
        query: '   \n\t   ', // Whitespace constraint breach
        source: 'valid-source-id'
      }
    };

    await expect(command.execute(emptyQueryInput, mockContext)).rejects.toThrow(InputError);
    expect(mockIndexer.createEmbeddings).not.toHaveBeenCalled();
  });

  it('should securely log data layer write crashes with complete actor tracking and bubble the exception safely', async () => {
    const command = new CreateEmbeddingsCommand({
      permissions: mockPermissions,
      augmentationIndexer: mockIndexer,
      credentials: mockCredentials,
    });

    // Simulate a severe database driver or connection pool breakdown
    const infrastructureError = new Error('Vector DB pool exhausted on node cluster-01');
    vi.mocked(mockIndexer.createEmbeddings).mockRejectedValueOnce(infrastructureError);

    await expect(command.execute(defaultInput, mockContext)).rejects.toThrow(
      'Vector DB pool exhausted on node cluster-01'
    );

    // Verify the failure log cleanly encapsulates userRef, source, and error properties
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Data Layer Write Failure: Augmentation Indexer failed to synchronize vector rows'),
      expect.objectContaining({
        safeSource: 'backstage-docs-catalog',
        userRef: 'user:default/kevin',
        errorMessage: 'Vector DB pool exhausted on node cluster-01'
      })
    );
  });

  it('should cleanly encapsulate and isolate entityFilter dictionary parameters from prototype pollution vectors', async () => {
    const command = new CreateEmbeddingsCommand({
      permissions: mockPermissions,
      augmentationIndexer: mockIndexer,
      credentials: mockCredentials,
    });

    const maliciousFilterInput: PackedRequestInput = {
      ...defaultInput,
      body: {
        query: 'Execute security profiling tasks',
        source: 'secure-source-target',
        entityFilter: {
          __proto__: { injectedMaliciousKey: 'hijacked_heap_register' },
          validScope: 'component:default/core-service'
        }
      }
    };

    const result = await command.execute(maliciousFilterInput, mockContext);
    expect(result.response).toBe('Embeddings created for source secure-source-target');

    // Capture the mock parameters array natively via safe positional queries
    const calls = vi.mocked(mockIndexer.createEmbeddings).mock.calls;
    const firstCall = calls[0];
    const filterPayload = firstCall ? firstCall[1] : undefined;

    // Use an explicit string lookup record mapping to bypass strict property checks natively
    const filterRecord = filterPayload as Record<string, unknown>;
    expect(filterRecord['injectedMaliciousKey']).toBeUndefined();
    expect(filterRecord['validScope']).toBe('component:default/core-service');
  });
});
