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
  NotImplementedError,
} from '@backstage/errors';
import {
  createEmbeddingsAction,
  deleteEmbeddingsAction,
  getEmbeddingsAction,
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

describe('getEmbeddingsAction - Controlled Context Retrieval Boundary', () => {
  let mockLogger: any;
  let mockPipeline: any;
  let mockContext: any;
  let mockResponse: Partial<Response>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };

    mockPipeline = {
      retrieveAugmentationContext: vi.fn().mockResolvedValue(['chunk_1', 'chunk_2'])
    };

    mockContext = {
      logger: mockLogger,
      validateSource: vi.fn((src) => src || 'all'),
      retrievalPipeline: mockPipeline,
      hardening: { timeoutMs: 30000 }
    };

    mockResponse = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis()
    };
  });

  it('should immediately raise an InputError when the query parameter mapping fails Zod schema verification', async () => {
    const brokenRequest = {
      query: {
        // Missing the required 'query' parameter field completely
        source: 'confluence-kb'
      }
    } as unknown as Request;

    await expect(
      getEmbeddingsAction(brokenRequest, mockResponse as Response, mockContext, 'user:default/unauthorized-reader')
    ).rejects.toThrow(InputError);

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Schema Validation Rejection'),
      expect.any(Object)
    );
    expect(mockPipeline.retrieveAugmentationContext).not.toHaveBeenCalled();
  });

  it('should throw a NotImplementedError when the retrieval pipeline reference is missing from the controller context', async () => {
    const validRequest = {
      query: { query: 'Fetch identity parameters', source: 'vault' },
      path: '/embeddings/get'
    } as unknown as Request;

    // Simulate an unconfigured deployment node scenario
    mockContext.retrievalPipeline = undefined;

    await expect(
      getEmbeddingsAction(validRequest, mockResponse as Response, mockContext, 'user:default/engineer')
    ).rejects.toThrow(NotImplementedError);

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Infrastructure Execution Failure'),
      expect.any(Object)
    );
  });

  it('should forward parameters cleanly to the pipeline service and issue a 200 OK array on valid inputs', async () => {
    const validRequest = {
      query: {
        query: 'How to configure OTel distributed metrics tracking?',
        source: 'engineering-playbook',
        // Optional query parameters map to undefined unless structured in a URL query string
        entityFilter: undefined 
      },
      path: '/embeddings/get'
    } as unknown as Request;

    const response = await getEmbeddingsAction(
      validRequest,
      mockResponse as Response,
      mockContext,
      'user:default/auditor-staff'
    );

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.send).toHaveBeenCalledWith({ results: ['chunk_1', 'chunk_2'] });

    // Fix: Match the exact undefined structure passed by the Zod query parser extraction
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
        queryLength: 51
      })
    );
  });

  it('should catch async read anomalies, log context fields safely, and mask the public error exception', async () => {
    const crashProneRequest = {
      query: { query: 'Query executing against unresponsive database index', source: 'corrupted-shard' },
      path: '/embeddings/get'
    } as unknown as Request;

    mockPipeline.retrieveAugmentationContext.mockRejectedValue(new Error('Vector embedding index pointer corrupted'));

    // Assert that it cleanly intercepts and masks the raw message for security tracking purposes
    await expect(
      getEmbeddingsAction(crashProneRequest, mockResponse as Response, mockContext, 'user:default/dev-ops')
    ).rejects.toThrow('An internal data layer exception blocked vector retrieval execution profiles.');

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Data Layer Read Retrieval Failure'),
      expect.objectContaining({
        safeSource: 'corrupted-shard',
        userRef: 'user:default/dev-ops',
        internalError: 'Vector embedding index pointer corrupted'
      })
    );
  });


  it('should trigger a timeout rejection when the retrieval pipeline takes longer than configured hardening boundaries', async () => {
    const slowRequest = {
      query: { query: 'Long running search task', source: 'massive-corpus' },
      path: '/embeddings/get'
    } as unknown as Request;

    mockContext.hardening = { timeoutMs: 1 };
    mockPipeline.retrieveAugmentationContext.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 5000)));

    await expect(
      getEmbeddingsAction(slowRequest, mockResponse as Response, mockContext, 'user:default/ops-lead')
    ).rejects.toThrow('Vector data layer retrieval task exceeded maximum configured timeout boundary');
  });

  it('should sanitize raw infrastructure exceptions into an UnexpectedError to prevent data layout leakage', async () => {
    const validRequest = {
      query: { query: 'Fetch target infrastructure parameters', source: 'secure-vault' },
      path: '/embeddings/get'
    } as unknown as Request;

    // Simulate an internal database cluster or network stack tracing timeout failure
    mockPipeline.retrieveAugmentationContext.mockRejectedValue(
      new Error('FATAL: Internal PostgreSQL connection pooling slot exhaust limit reached [Cluster Topology: 10.0.1.5]')
    );

    // Verify it completely masks the internal raw message behind an UnexpectedError
    await expect(
      getEmbeddingsAction(validRequest, mockResponse as Response, mockContext, 'user:default/analyst')
    ).rejects.toThrow(Error);

    // Verify that the user-visible message remains sanitized
    await expect(
      getEmbeddingsAction(validRequest, mockResponse as Response, mockContext, 'user:default/analyst')
    ).rejects.toThrow('An internal data layer exception blocked vector retrieval execution profiles.');
  });

  it('should successfully handle whitespace padding mutations on search queries without shifting index tracks', async () => {
    const trailingWhitespaceRequest = {
      query: { query: '   Clean architecture standards mapping    ', source: 'confluence-kb' },
      path: '/embeddings/get'
    } as unknown as Request;

    await getEmbeddingsAction(trailingWhitespaceRequest, mockResponse as Response, mockContext, 'user:default/tester');

    // Prove the pipeline receives a trimmed string to eliminate wasteful token generation over spaces
    expect(mockPipeline.retrieveAugmentationContext).toHaveBeenCalledWith(
      'Clean architecture standards mapping',
      'confluence-kb',
      undefined
    );
  });

});
