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
import { InputError } from '@backstage/errors';
import { createEmbeddingsAction } from '../embedding';

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
