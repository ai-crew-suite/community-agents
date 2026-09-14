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
import {
  InputError,
  ConflictError,
} from '@backstage/errors';
import {
  createEmbeddingsAction,
  deleteEmbeddingsAction,
} from '../embedding';

describe('createEmbeddingsAction - Embedded Knowledge Integration Module', () => {
  let mockLogger: any;
  let mockIndexer: any;
  let mockContext: any;
  let mockResponse: Partial<Response>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };

    mockIndexer = {
      createEmbeddings: vi.fn().mockResolvedValue(undefined)
    };

    mockContext = {
      logger: mockLogger,
      validateSource: vi.fn((src) => src || 'all'),
      augmentationIndexer: mockIndexer
    };

    mockResponse = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis()
    };
  });

  it('should immediately raise a standard InputError when provided an invalid empty payload request structure', async () => {
    const malformedRequest = {
      body: {
        // Missing required 'query' and 'source' field arguments completely
        entityFilter: 'component:default/test-service'
      }
    } as unknown as Request;

    await expect(
      createEmbeddingsAction(malformedRequest, mockResponse as Response, mockContext, 'user:default/kevin')
    ).rejects.toThrow(InputError);

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Schema Validation Rejection'),
      expect.any(Object)
    );
    expect(mockIndexer.createEmbeddings).not.toHaveBeenCalled();
  });

  it('should forward structured parameters down to the indexing service and issue a 201 response on valid inputs', async () => {
    const validRequest = {
      body: {
        query: 'Analyze software template configurations for security policies',
        source: 'backstage-docs-catalog',
        entityFilter: {}
      },
      path: '/embeddings/create'
    } as unknown as Request;

    const response = await createEmbeddingsAction(
      validRequest,
      mockResponse as Response,
      mockContext,
      'user:default/admin-staff'
    );

    expect(response.status).toHaveBeenCalledWith(201);
    expect(response.send).toHaveBeenCalledWith({
      response: 'Embeddings created for source backstage-docs-catalog'
    });

    expect(mockIndexer.createEmbeddings).toHaveBeenCalledWith(
      'backstage-docs-catalog',
      expect.any(Object)
    );

    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('Executing catalog knowledge vector indexing injection loop'),
      expect.objectContaining({
        safeSource: 'backstage-docs-catalog',
        userRef: 'user:default/admin-staff'
      })
    );
  });

  it('should normalize blank or whitespace-only source parameters to "all" and execute safely', async () => {
    const emptySourceRequest = {
      body: {
        query: 'Verify baseline compliance parameters mapping schemas',
        source: '   ', // Whitespace input scenario
        entityFilter: {}
      },
      path: '/embeddings/create'
    } as unknown as Request;

    // Mock validateSource to mimic the true factory context utility fallback behavior
    mockContext.validateSource.mockReturnValue('all');

    const response = await createEmbeddingsAction(
      emptySourceRequest,
      mockResponse as Response,
      mockContext,
      'user:default/compliance-officer'
    );

    expect(response.status).toHaveBeenCalledWith(201);
    expect(mockContext.validateSource).toHaveBeenCalledWith('   ');
    // Proves the data layer receives the normalized fallback token string
    expect(mockIndexer.createEmbeddings).toHaveBeenCalledWith('all', expect.any(Object));
  });

  it('should safely slice massive query strings into logging snippets without buffer exhaustion anomalies', async () => {
    const massiveQuery = 'A'.repeat(5000); // 5KB massive token payload block injection
    const highThroughputRequest = {
      body: {
        query: massiveQuery,
        source: 'large-scale-corpus',
        entityFilter: {}
      },
      path: '/embeddings/create'
    } as unknown as Request;

    await createEmbeddingsAction(
      highThroughputRequest,
      mockResponse as Response,
      mockContext,
      'user:default/analytics-engine'
    );

    // Verify completion log safely truncates the string to protect tracking limits (Section F.1)
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('Successfully synchronized catalog vector data boundaries'),
      expect.objectContaining({
        querySnippet: 'A'.repeat(30) // Checks exact 30-character boundary limits
      })
    );
  });

  it('should catch synchronous utility drops inside validateSource and bubble exceptions safely through error middleware', async () => {
    const faultyRequest = {
      body: {
        query: 'Evaluate pipeline runtime execution targets',
        source: 'unstable-source-ref',
        entityFilter: {}
      },
      path: '/embeddings/create'
    } as unknown as Request;

    // Force validateSource to throw a lower-level memory or mapping breakdown exception
    mockContext.validateSource.mockImplementation(() => {
      throw new Error('System catalog reference link corruption');
    });

    await expect(
      createEmbeddingsAction(faultyRequest, mockResponse as Response, mockContext, 'user:default/sys-admin')
    ).rejects.toThrow('System catalog reference link corruption');

    // The validation failure happens before indexing, proving the indexer is safely bypassed
    expect(mockIndexer.createEmbeddings).not.toHaveBeenCalled();
  });
});

describe('deleteEmbeddingsAction - Controlled Vector Erasure Boundary', () => {
  let mockLogger: any;
  let mockIndexer: any;
  let mockContext: any;
  let mockResponse: Partial<Response>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };

    mockIndexer = {
      deleteEmbeddings: vi.fn().mockResolvedValue(undefined)
    };

    mockContext = {
      logger: mockLogger,
      validateSource: vi.fn((src) => src || 'all'),
      augmentationIndexer: mockIndexer
    };

    mockResponse = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis()
    };
  });

  it('should immediately raise an InputError when the input data structural layout fails basic Zod validation', async () => {
    const brokenRequest = {
      body: {
        // Missing the required 'source' property field completely
        entityFilter: { group: 'engineering' }
      }
    } as unknown as Request;

    await expect(
      deleteEmbeddingsAction(brokenRequest, mockResponse as Response, mockContext, 'user:default/malicious-actor')
    ).rejects.toThrow(InputError);

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Schema Validation Rejection'),
      expect.any(Object)
    );
    expect(mockIndexer.deleteEmbeddings).not.toHaveBeenCalled();
  });

  it('should safely dispatch strings to the indexer and issue a 200 OK update upon successful processing', async () => {
    const validDeletionRequest = {
      body: {
        source: 'legacy-wiki-docs',
        entityFilter: { target: 'deprecated' }
      },
      path: '/embeddings/delete'
    } as unknown as Request;

    const response = await deleteEmbeddingsAction(
      validDeletionRequest,
      mockResponse as Response,
      mockContext,
      'user:default/ops-engineer'
    );

    // Assert correct REST protocol semantics
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.send).toHaveBeenCalledWith({
      response: 'Embeddings deleted for source legacy-wiki-docs'
    });

    // Verify indexer call signatures match positional assumptions perfectly
    expect(mockIndexer.deleteEmbeddings).toHaveBeenCalledWith('legacy-wiki-docs', { target: 'deprecated' });

    // Verify compliance audit footprints are tracked with explicit structured variables
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Initiating catalog data destruction routine'),
      expect.objectContaining({
        safeSource: 'legacy-wiki-docs',
        userRef: 'user:default/ops-engineer'
      })
    );
  });

  it('should intercept async data-layer crashes, execute critical error logging, and bubble up the exception', async () => {
    const crashProneRequest = {
      body: {
        source: 'protected-critical-index',
        entityFilter: {}
      },
      path: '/embeddings/delete'
    } as unknown as Request;

    mockIndexer.deleteEmbeddings.mockRejectedValue(new Error('Database partition allocation breakdown'));

    await expect(
      deleteEmbeddingsAction(crashProneRequest, mockResponse as Response, mockContext, 'user:default/admin-user')
    ).rejects.toThrow('Database partition allocation breakdown');

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Data Layer Mutative Erasure Failure'),
      expect.objectContaining({
        safeSource: 'protected-critical-index',
        userRef: 'user:default/admin-user',
        errorMessage: 'Database partition allocation breakdown'
      })
    );
  });

  it('should explicitly throw a ConflictError when the data layer outputs a table deadlock exception', async () => {
    const deadlockRequest = {
      body: { source: 'contended-index-table', entityFilter: {} },
      path: '/embeddings/delete'
    } as unknown as Request;

    // Simulate an unexpected transactional lock condition
    mockIndexer.deleteEmbeddings.mockRejectedValue(new Error('Transaction serialization error: concurrent index lock deadlock encountered'));

    await expect(
      deleteEmbeddingsAction(deadlockRequest, mockResponse as Response, mockContext, 'user:default/analyst')
    ).rejects.toThrow(ConflictError);

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Database Mutative Race Condition Caught'),
      expect.any(Object)
    );
  });

  it('should trigger a timeout rejection when the indexer call takes longer than the configured hardening limits', async () => {
    const slowRequest = {
      body: { source: 'unresponsive-massive-shards', entityFilter: {} },
      path: '/embeddings/delete'
    } as unknown as Request;

    // Inject an explicit low timeout limit to force the timeout promise race victory
    mockContext.hardening = { timeoutMs: 1 };

    // Simulate a database loop that hangs indefinitely
    mockIndexer.deleteEmbeddings.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 5000)));

    await expect(
      deleteEmbeddingsAction(slowRequest, mockResponse as Response, mockContext, 'user:default/ops-lead')
    ).rejects.toThrow('Vector data layer deletion task exceeded maximum configured timeout boundary');
  });
});
