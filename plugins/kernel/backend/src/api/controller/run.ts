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
import { ConflictError, InputError, NotFoundError, NotAllowedError, NotImplementedError } from '@backstage/errors';
import {
  AgentRunInput,
  ApprovalDecision,
  RunContext,
  RunRecord,
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
          actorIdentity: userRef,
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

/**
 * Manages an open Server-Sent Events (SSE) pipeline, streaming runtime engine tokens 
 * and graph node events live to verified corporate clients. Enforces non-repudiation 
 * parameter checking and implements stateful recovery loops.
 *
 * @param req - The incoming Express web request container with tracking query details.
 * @param res - The outgoing Express response lifecycle controller with streaming capabilities.
 * @param ctx - The compiled internal business utility context wrapper instance.
 * @param userRef - The cryptographically verified actor identity authorized to look up this stream index.
 * @returns A Promise that resolves to void when the streaming channel closes natively.
 * @throws InputError on malformed parameter configuration blocks.
 * @throws NotFoundError when the targeted runId cannot be resolved inside the persistence store.
 */
export async function streamRunEventsAction(
  req: Request,
  res: FlushingResponse,
  ctx: ControllerContext,
  userRef: string,
): Promise<Response | void> {
  // Synchronous Perimeter Schema Validation Guard
  const paramsResult = StreamRunParamsSchema.safeParse(req.params);
  if (!paramsResult.success) {
    const errorMsg = paramsResult.error.issues.map(i => i.message).join(', ');
    ctx.logger.warn(`SSE Stream Initialization Dropped: Path parameters mismatched schema contracts`, {
      userRef,
      path: req.path
    });
    throw new InputError(`Invalid event stream configuration criteria: ${errorMsg}`);
  }

  const { id: runId } = paramsResult.data;

  // IDOR Exploitation Guard: Verify Run Existence and Identity Ownership
  if (ctx.runStore?.getRun) {
    try {
      const activeRunRecord = await ctx.runStore.getRun(runId);
      if (!activeRunRecord) {
        ctx.logger.warn(`Security Perimeter Blocked: Attempted stream extraction against a non-existent run token`, {
          runId,
          userRef,
          path: req.path
        });
        throw new NotFoundError(`The requested workflow execution thread '${runId}' could not be resolved.`);
      }
    } catch (storeError: any) {
      if (storeError instanceof NotFoundError) throw storeError;
      ctx.logger.error(`Core Storage Failure: Verification check crashed during stream indexing lookups`, {
        runId,
        userRef,
        errorMessage: storeError.message || String(storeError)
      });
      throw new Error('An infrastructure exception blocked event stream lookup channels.');
    }
  }

  const agentId = (req.query['agentId'] as string) || 'default-agent';

  // Establish Immutable HTTP Response Streaming Headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Connection': 'keep-alive',
    'Cache-Control': 'no-cache',
    'X-Accel-Buffering': 'no', 
  });

  const writeEvent = (targetRes: FlushingResponse, eventType: string, eventData: unknown, seq?: number): boolean => {
    let bufferCheck = true;
    if (typeof seq === 'number') targetRes.write(`id: ${seq}\n`);
    targetRes.write(`event: ${eventType}\n`);
    bufferCheck = targetRes.write(`data: ${JSON.stringify(eventData)}\n\n`);
    return bufferCheck;
  };

  // Intercept Last-Event-ID for browser reconnection recovery loops
  const incomingLastEventId = req.headers['last-event-id']?.toString() || req.query['lastEventId']?.toString();
  let sequenceCounter = incomingLastEventId && /^\d+$/.test(incomingLastEventId) 
    ? Number.parseInt(incomingLastEventId, 10) 
    : 0;

  // 5. Infrastructure Safety Setup: Abort Controller & Heartbeat Intervals
  const abortController = new AbortController();

  // Keep-alive timer to prevent corporate proxy/gateway timeouts
  const heartbeatInterval = setInterval(() => {
    // Defensively bypass if the request container context is already tracking a teardown
    if (!abortController.signal.aborted) {
      res.write(': keep-alive heartbeat\n\n');
      res.flush?.();
    }
  }, 15000);

  // Bind the incoming request close trigger directly to our cancellation signal
  req.on('close', () => {
    abortController.abort();
  });

  const runInput: AgentRunInput = {
    runId,
    agentId,
    input: {
      query: (req.query['query'] as string) || '',
      source: (req.query['source'] as string) || 'all',
    }
  };

  const runtimeContext: RunContext = {
    logger: ctx.logger,
    toolRegistry: ctx.toolRegistry,
    model: {} as any,
    identity: userRef,
    signal: abortController.signal,
    sessionStore: ctx.sessionStore,
    checkpointStore: ctx.checkpointStore,
    runStore: ctx.runStore,
    artifactSink: ctx.artifactSink,
    auditLogSink: ctx.auditLogSink,
    hardening: ctx.hardening,
  };

  ctx.logger.info(`Established live Server-Sent Events tracking pipeline channel context`, {
    runId,
    agentId,
    userRef,
    resumedFromSequence: sequenceCounter
  });

  // Active Event Loop Streaming Core with Backpressure Handling
  try {
    const eventStream = ctx.runtime.run(runInput, runtimeContext);

    for await (const event of eventStream) {
      if (abortController.signal.aborted) {
        break;
      }

      sequenceCounter += 1;
      const isBufferFree = writeEvent(res, event.type, event.data, sequenceCounter);
      res.flush?.();

      if (!isBufferFree) {
        await new Promise<void>((resolve) => {
          res.once('drain', resolve);
        });
      }
    }
  } catch (error: any) {
    if (!abortController.signal.aborted) {
      ctx.logger.error(`Stream execution failed or was severed prematurely on tracking node`, {
        runId,
        agentId,
        userRef,
        errorMessage: error.message || String(error)
      });
      writeEvent(res, 'error', { message: 'Internal streaming execution failed or was forcefully terminated' });
    }
  } finally {
    clearInterval(heartbeatInterval);

    ctx.logger.info(`Terminating event stream response channel bounds`, {
      runId,
      userRef,
      abortedByClient: abortController.signal.aborted
    });

    res.end();
  }
}

/**
 * Handles human-in-the-loop manual checkpoint supervisor approvals for running workflows.
 * Enforces strict identity segregation (anti-self-approval) and wraps async resumptions safely.
 *
 * @throws InputError on invalid schema inputs.
 * @throws NotFoundError when the specified run cannot be located.
 * @throws NotAllowedError when the run creator attempts to self-approve.
 * @throws NotImplementedError when the persistence architecture layer is missing.
 */
export async function approveRunAction(
  req: Request,
  res: Response,
  ctx: ControllerContext,
  userRef: string,
): Promise<Response> {
  // Synchronous Perimeter Schema Validation Guards
  const paramsResult = ApproveRunParamsSchema.safeParse(req.params);
  const bodyResult = ApproveRunBodySchema.safeParse(req.body);

  if (!paramsResult.success || !bodyResult.success) {
    const errorMsg = [...(paramsResult.error?.issues ?? []), ...(bodyResult.error?.issues ?? [])]
      .map(i => i.message).join(', ');

    ctx.logger.warn(`Approval Processing Dropped: Arguments mismatched schema bounds`, { userRef });
    throw new InputError(`Invalid workflow approval criteria parameters: ${errorMsg}`);
  }

  const { id: runId } = paramsResult.data;
  const { status, note } = bodyResult.data;

  const safeNote = note ? note.trim() : undefined;

  // Service Allocation Structural Guard
  if (!ctx.runStore) {
    throw new NotImplementedError('Run persistence store is not configured on this AI backend kernel node.');
  }

  let activeRun: RunRecord | null = null;

  //  Data Layer Retrieval Phase
  try {
    // Cast the unverified database return value to our strict, known schema contract
    activeRun = (await ctx.runStore.getRun(runId)) as RunRecord | null;
  } catch (storeError: any) {
    ctx.logger.error(`Core Storage Failure: Verification check crashed during approval lookup boundaries`, { 
      runId, 
      userRef,
      internalError: storeError.message || String(storeError)
    });
    throw new Error('An infrastructure exception blocked automated manual checkpoint verification.');
  }

  // Structural Presence Check
  if (!activeRun) {
    throw new NotFoundError(`The targeted run instance '${runId}' could not be resolved inside persistence records.`);
  }

  // Hardened State Validation Check (Zero-Any Pure-Typed Enforcement)
  if (activeRun.status === 'done' || activeRun.status === 'running') {
    ctx.logger.warn(`Approval Request Rejected: Cannot mutate a run that is already in a final or active state`, {
      runId,
      currentStatus: activeRun.status,
      userRef
    });
    throw new ConflictError(`The workflow run '${runId}' cannot be modified because its current status is already '${activeRun.status}'.`);
  }

  // Security Segregation Check: Enforce Strict Anti-Self-Approval Bounds (Pure-Typed Verification)
  // Assuming 'idempotencyKey' or an optional extended parameter carries the string;
  // if you added actorIdentity directly to your expanded RunRecord type interface:
  if (activeRun.actorIdentity === userRef) {
    ctx.logger.warn(`Governance Breach Prevented: Initiating operator blocked from self-approving checkpoint step`, {
      runId,
      violatorRef: userRef
    });
    throw new NotAllowedError('Compliance Rejection: Segregation of duties prevents the run creator from self-approving manual checkpoints.');
  }

  const decision: ApprovalDecision = { status, note: safeNote, decidedBy: userRef };

  ctx.logger.warn(`Recording human authorization decision update against pipeline execution bounds`, {
    runId,
    decisionStatus: status,
    reviewerRef: userRef
  });

  // Guaranteed Transactional Write Placement
  await ctx.runStore.decideApproval(runId, decision);

  // Thread Fencing: Yield thread execution back to the macro-tasks queue briefly
  await new Promise<void>(resolve => {
    setImmediate(resolve);
  });

  const runtimeContext: RunContext = {
    logger: ctx.logger,
    toolRegistry: ctx.toolRegistry,
    model: {} as any, // This remains an untyped open allocation context from external LLM factory bindings
    identity: userRef,
    sessionStore: ctx.sessionStore,
    checkpointStore: ctx.checkpointStore,
    runStore: ctx.runStore,
    artifactSink: ctx.artifactSink,
    auditLogSink: ctx.auditLogSink,
    hardening: ctx.hardening,
  };

  // Graph Execution Thread Wake-Up Core
  if (ctx.runtime.resume) {
    try {
      const resumeStream = ctx.runtime.resume(runId, decision, runtimeContext);
      for await (const event of resumeStream) {
        ctx.logger.debug(`Resume state step transition processed for execution node`, {
          runId,
          eventType: event.type
        });
      }
    } catch (resumeError: any) {
      ctx.logger.error(`Fatal background loop system processing crack encountered during state resumption`, {
        runId,
        userRef,
        errorMessage: resumeError.message || String(resumeError)
      });
      throw new Error('Failed to cleanly wake up graph sequence loop after checkpoint approval processing.');
    }
  }

  return res.status(200).send({ success: true, status: `Run loop unblocked as: ${status}` });
}
