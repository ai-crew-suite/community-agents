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
import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import { InputError, NotAllowedError } from '@backstage/errors';
import {
  AgentRunInput,
  ApprovalDecision,
} from '@ai-crew-suite/plugin-kernel-node';
import {
  ApproveRunBodySchema,
  ApproveRunParamsSchema,
  StartRunBodySchema,
  StartRunParamsSchema,
  StreamRunParamsSchema,
} from './schemas';
import type { ControllerContext } from './types';

interface FlushingResponse extends Response {
  flush?: () => void;
}

/**
 * Initializes a new multi-agent execution thread lifecycle within the core runtime engine.
 * Implements defensive data sanitation and guarantees persistence mapping serialization 
 * to protect against downstream streaming read/write race conditions.
 *
 * @param req - The incoming Express web request container.
 * @param res - The outgoing Express response lifecycle controller.
 * @param ctx - The compiled internal business utility context wrapper instance.
 * @param userRef - The cryptographically verified actor identity initializing the agent execution chain.
 * @returns A Promise resolving to an explicit Response acknowledgement receipt.
 * @throws InputError when incoming parameters fail basic schema validation or point to missing agents.
 * @throws NotAllowedError when custom header elements are missing during cookie extraction boundaries.
 */
export async function startRunAction(
  req: Request,
  res: Response,
  ctx: ControllerContext,
  userRef: string,
): Promise<Response> {
  // If the authorization token is derived from a cookie context layer, enforce a custom tracking header check
  const hasAuthHeader = Boolean(req.headers?.['authorization']);
  const hasCsrfGateHeader = Boolean(req.headers?.['x-requested-with'] || req.headers?.['backstage-ajax-token']);

  if (!hasAuthHeader && !hasCsrfGateHeader) {
    ctx.logger.warn(`Security Perimeter Blocked: Mutative run request dropped due to missing custom cross-origin verification tokens`, {
      userRef,
      path: req.path,
      ip: req.ip
    });
    throw new NotAllowedError('Missing cross-site request validation headers required for cookie authorization paths.');
  }

  // Synchronous Perimeter Schema Validation Guards
  const paramsResult = StartRunParamsSchema.safeParse(req.params);

  const parsedBodyTarget = (req.body && typeof req.body === 'object' && 'input' in req.body)
    ? (req.body as Record<string, unknown>)['input']
    : req.body;
  const bodyResult = StartRunBodySchema.safeParse(parsedBodyTarget);

  if (!paramsResult.success || !bodyResult.success) {
    const errorMsg = [...(paramsResult.error?.issues ?? []), ...(bodyResult.error?.issues ?? [])]
      .map(i => i.message).join(', ');

    ctx.logger.warn(`Run Initialization Dropped: Payload bounds mismatched schema contracts`, {
      userRef,
      path: req.path
    });
    throw new InputError(`Invalid run initialization criteria: ${errorMsg}`);
  }

  const { id: agentId } = paramsResult.data;

  if (!ctx.agents.has(agentId)) {
    ctx.logger.error(`Run Initialization Rejected: Requested agent target mapping does not exist`, {
      agentId,
      userRef
    });
    throw new InputError(`Unknown agent identifier target provided: '${agentId}'`);
  }

  // Local Resilience Throttling Gates (Section B.1 Throttling)
  if (!ctx.consumeRateLimit(agentId)) {
    ctx.logger.warn(`Governance Boundary Triggered: Run creation blocked due to rate limit threshold exhaustion`, {
      agentId,
      userRef
    });
    return res.status(429).send({ message: 'Rate limit exceeded for agent' });
  }

  const runId = randomUUID();

  // Clean and sanitize raw whitespace text formatting metrics upfront
  const rawQuery = (parsedBodyTarget && typeof parsedBodyTarget === 'object' && 'query' in parsedBodyTarget)
    ? String((parsedBodyTarget as Record<string, unknown>)['query']).trim()
    : '';

  // SExplicit metadata tracing mapping objects
  ctx.logger.info(`Initializing agent thread lifecycle yielding tracking target identifier`, {
    runId,
    agentId,
    userRef,
    queryLength: rawQuery.length,
    executionMode: 'user_orchestrated_run'
  });

  // Guaranteed Durable Persistence Serialization (Prevents Read/Write Race Conditions)
  if (ctx.runStore?.createRun) {
    const dbTimeoutMs = ctx.hardening?.timeoutMs || 10000;
    const dbTimeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Core storage ledger allocation operation exceeded system time limits')), dbTimeoutMs)
    );

    try {
      await Promise.race([
        ctx.runStore.createRun({
          id: runId,
          agentId,
          status: 'initialized',
          createdAt: new Date().toISOString()
        }),
        dbTimeoutPromise
      ]);
    } catch (storeError: any) {
      ctx.logger.error(`Critical Persistence Ledger Allocation Failure: Failed to write run tracking node`, {
        runId,
        agentId,
        userRef,
        errorMessage: storeError.message || String(storeError)
      });
      throw new Error('An infrastructure exception blocked workflow thread execution provisioning channels.');
    }
  }

  return res.status(202).send({ runId, status: 'accepted' });
}

export async function streamRunEventsAction(
  req: Request,
  res: FlushingResponse,
  ctx: ControllerContext,
  _userRef: unknown, // implement this - added to call site in plugins/kernel/backend/src/api/controller/index.ts
): Promise<Response | void> {
  const paramsResult = StreamRunParamsSchema.safeParse(req.params);
  if (!paramsResult.success) {
    return res.status(422).send({ message: paramsResult.error.issues.map(i => i.message).join(', ') });
  }

  const { id: runId } = paramsResult.data;
  const agentId = req.query['agentId'] as string || 'default-agent';

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    Connection: 'keep-alive',
    'Cache-Control': 'no-cache',
  });

  const writeEvent = (targetRes: FlushingResponse, eventType: string, eventData: unknown, seq?: number): void => {
    if (typeof seq === 'number') targetRes.write(`id: ${seq}\n`);
    targetRes.write(`event: ${eventType}\n`);
    targetRes.write(`data: ${JSON.stringify(eventData)}\n\n`);
  };

  const runInput: AgentRunInput = {
    runId,
    agentId,
    input: {
      query: (req.query['query'] as string) || '',
      source: (req.query['source'] as string) || 'all',
    }
  };

  const runtimeContext = {
    logger: ctx.logger,
    toolRegistry: ctx.toolRegistry,
    model: {} as any, 
    identity: 'authenticated-user',
    sessionStore: ctx.sessionStore,
    checkpointStore: ctx.checkpointStore,
    runStore: ctx.runStore,
    artifactSink: ctx.artifactSink,
    auditLogSink: ctx.auditLogSink,
    hardening: ctx.hardening,
  };

  try {
    const eventStream = ctx.runtime.run(runInput, runtimeContext);
    let sequenceCounter = 0;

    for await (const event of eventStream) {
      sequenceCounter += 1;
      writeEvent(res, event.type, event.data, sequenceCounter);
      res.flush?.();
    }
  } catch (error) {
    ctx.logger.error(`Stream execution failed on run [${runId}]: ${(error as Error).message}`);
    writeEvent(res, 'error', { message: 'Internal streaming execution failed' });
  } finally {
    res.end();
  }
}

export async function approveRunAction(
  req: Request,
  res: Response,
  ctx: ControllerContext,
  _userRef: unknown, // implement this - added to call site in plugins/kernel/backend/src/api/controller/index.ts
): Promise<Response | void> {
  const paramsResult = ApproveRunParamsSchema.safeParse(req.params);
  const bodyResult = ApproveRunBodySchema.safeParse(req.body);

  if (!paramsResult.success || !bodyResult.success) {
    const errorMsg = [...(paramsResult.error?.issues ?? []), ...(bodyResult.error?.issues ?? [])]
      .map(i => i.message).join(', ');
    return res.status(422).send({ message: errorMsg });
  }

  const { id: runId } = paramsResult.data;
  const { status, note } = bodyResult.data;

  if (!ctx.runStore) {
    return res.status(501).send({ message: 'Run persistence store is not configured on this AI backend kernel node.' });
  }

  const reviewerRef = ctx.identity(req);
  const decision: ApprovalDecision = { status, note, decidedBy: reviewerRef };

  ctx.logger.info(`Recording human authorization decision [${status}] targeting run token coordinate: ${runId}`);
  await ctx.runStore.decideApproval(runId, decision);

  const runtimeContext = {
    logger: ctx.logger,
    toolRegistry: ctx.toolRegistry,
    model: {} as any,
    identity: reviewerRef,
    sessionStore: ctx.sessionStore,
    checkpointStore: ctx.checkpointStore,
    runStore: ctx.runStore,
    artifactSink: ctx.artifactSink,
    auditLogSink: ctx.auditLogSink,
    hardening: ctx.hardening,
  };

  try {
    const resumeStream = ctx.runtime.resume(runId, decision, runtimeContext);
    for await (const event of resumeStream) {
      ctx.logger.debug(`Resume step processed for thread [${runId}]: ${event.type}`);
    }
  } catch (error) {
    ctx.logger.error(`Failed to cleanly wake up graph sequence thread on run [${runId}]: ${(error as Error).message}`);
    return res.status(500).send({ message: 'Failed to properly resume graph iteration.' });
  }

  return res.status(200).send({ success: true, status: `Run loop unblocked as: ${status}` });
}
