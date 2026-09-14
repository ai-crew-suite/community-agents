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
import { CreateEmbeddingsSchema, DeleteEmbeddingsSchema, GetEmbeddingsQuerySchema } from './schemas';
import type { ControllerContext } from './types';
import {
  InputError,
  ConflictError,
} from '@backstage/errors';

/**
 * Executes vector or indexing metadata asset additions inside the system knowledge catalog.
 * Enforces strict identity binding and wraps async dependencies inside robust error logging boundaries.
 *
 * @param req - The incoming Express web request container.
 * @param res - The outgoing Express response lifecycle controller.
 * @param ctx - The compiled internal business utility context wrapper instance.
 * @param userRef - The cryptographically verified actor identifier tracking the execution footprint.
 * @returns A Promise that resolves to the completed network Response block.
 * @throws InputError when incoming parameter boundaries fail schema parsing tests.
 */
export async function createEmbeddingsAction(
  req: Request,
  res: Response,
  ctx: ControllerContext,
  userRef: string,
): Promise<Response> {
  // Synchronous Perimeter Schema Validation Guard
  const result = CreateEmbeddingsSchema.safeParse(req.body);
  if (!result.success) {
    const errorMsg = result.error.issues.map(i => i.message).join(', ');
    ctx.logger.warn(`Schema Validation Rejection: Invalid data payload provided for embedding creation`, {
      userRef,
      path: req.path,
      validationIssues: errorMsg
    });
    throw new InputError(`Invalid embedding configuration criteria: ${errorMsg}`);
  }

  const { query, source, entityFilter } = result.data;
  const safeSource = ctx.validateSource(source);

  // Pass query length and execution details into structured audit logs
  ctx.logger.info(`Executing catalog knowledge vector indexing injection loop`, {
    safeSource,
    userRef,
    queryLength: query.length,
    hasEntityFilter: Boolean(entityFilter)
  });

  // Hardened Asynchronous Error Boundary Implementation
  try {
    await ctx.augmentationIndexer.createEmbeddings(safeSource, entityFilter);
  } catch (error: any) {
    // Log the internal crash with tracking context
    ctx.logger.error(`Data Layer Write Failure: Augmentation Indexer failed to synchronize vector rows`, {
      safeSource,
      userRef,
      queryLength: query.length,
      errorMessage: error.message || String(error)
    });

    // Bubble up to let Centralized MiddlewareFactory handle sanitization and trace generation
    throw error;
  }

  // Ensure non-repudiation is preserved by tying the verified identity directly to the final tracking log
  ctx.logger.info(`Successfully synchronized catalog vector data boundaries`, {
    safeSource,
    userRef,
    querySnippet: query.substring(0, 30)
  });

  return res.status(201).send({ response: `Embeddings created for source ${safeSource}` });
}

/**
 * Handles the secure deletion of specific vector embedding records from the knowledge catalog.
 * Enforces identity-anchored audit tracking and wraps underlying persistence operations in strict exception gates.
 *
 * @param req - The incoming Express web request container.
 * @param res - The outgoing Express response lifecycle controller.
 * @param ctx - The compiled internal business utility context wrapper instance.
 * @param userRef - The cryptographically verified actor identifier tracking the execution footprint.
 * @returns A Promise that resolves to the completed network Response block.
 * @throws InputError when incoming parameter boundaries fail schema parsing tests.
 */
export async function deleteEmbeddingsAction(
  req: Request,
  res: Response,
  ctx: ControllerContext,
  userRef: string,
): Promise<Response> {
  // Structural Schema Guard Evaluation
  const result = DeleteEmbeddingsSchema.safeParse(req.body);
  if (!result.success) {
    const errorMsg = result.error.issues.map(i => i.message).join(', ');
    ctx.logger.warn(`Schema Validation Rejection: Invalid data payload provided for embedding deletion`, {
      userRef,
      path: req.path,
      validationIssues: errorMsg
    });
    throw new InputError(`Invalid embedding deletion criteria: ${errorMsg}`);
  }

  const { source, entityFilter } = result.data;
  const safeSource = ctx.validateSource(source);

  // Pass essential caller metadata identifiers to the structured audit log
  ctx.logger.warn(`Initiating catalog data destruction routine`, {
    safeSource,
    userRef,
    hasEntityFilter: Boolean(entityFilter),
    clientIp: req.ip || req.socket?.remoteAddress
  });

  // Bound Execution Context Configuration
  const operationTimeoutMs = ctx.hardening?.timeoutMs || 30000; 

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(
      new Error('Vector data layer deletion task exceeded maximum configured timeout boundary')),
      operationTimeoutMs
    )
  );

  // Hardened Asynchronous Error Boundary Implementation
  try {
    await Promise.race([
      ctx.augmentationIndexer.deleteEmbeddings(safeSource, entityFilter),
      timeoutPromise
    ]);
  } catch (error: any) {
    const errorMessage = error.message || String(error);

    // SMap transactional locking or cluster update blocks to ConflictError
    if (errorMessage.includes('lock') || errorMessage.includes('deadlock') || errorMessage.includes('concurrent')) {
      ctx.logger.warn(`Database Mutative Race Condition Caught: Deletion blocked by a concurrent table lock`, {
        safeSource,
        userRef,
        errorMessage
      });

      throw new ConflictError(
        `The embedding resource '${safeSource}' is currently undergoing a structural update cycle. Please retry shortly.`
      );
    }

    ctx.logger.error(`Data Layer Mutative Erasure Failure: Augmentation Indexer failed to purge vector entries`, {
      safeSource,
      userRef,
      errorMessage
    });
    throw error; // Bubble up to central platform MiddlewareFactory error sanitizers cleanly
  }

  ctx.logger.info(`Successfully synchronized mutative data erasure blocks`, {
    safeSource,
    userRef
  });

  return res.status(200).send({ response: `Embeddings deleted for source ${safeSource}` });
}

export async function getEmbeddingsAction(
  req: Request,
  res: Response,
  ctx: ControllerContext,
  _userRef: unknown, // implement this - added to call site in plugins/kernel/backend/src/api/controller/index.ts
): Promise<Response> {
  const result = GetEmbeddingsQuerySchema.safeParse(req.query);
  if (!result.success) {
    return res.status(422).send({ message: result.error.issues.map(i => i.message).join(', ') });
  }

  const { query, source, entityFilter } = result.data;
  const safeSource = ctx.validateSource(source);

  if (!ctx.retrievalPipeline) {
    return res.status(501).send({ message: 'Retrieval pipeline is not configured on this AI backend kernel node.' });
  }

  ctx.logger.info(`Executing context retrieval on source [${safeSource}] for query parameter.`);
  const results = await ctx.retrievalPipeline.retrieveAugmentationContext(query, safeSource, entityFilter);

  return res.status(200).send({ results });
}
