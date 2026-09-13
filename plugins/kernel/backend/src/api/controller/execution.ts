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
import {
  AgentRunInput,
  ApprovalDecision,
} from '@ai-crew-suite/plugin-kernel-node';
import {
  ApproveRunBodySchema,
  ApproveRunParamsSchema,
  GenericEventPayloadSchema,
  StartRunBodySchema,
  StartRunParamsSchema,
  StreamRunParamsSchema,
  TriggerRunParamsSchema,
  WebhookRunParamsSchema,
} from './schemas';
import type { ControllerContext } from '../../types';

interface FlushingResponse extends Response {
  flush?: () => void;
}

export async function approveRunAction(
  req: Request,
  res: Response,
  ctx: ControllerContext
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

  // 1. Extract the current reviewer identity via our secure facade check
  const reviewerRef = ctx.identity(req);

  // 2. Map cleanly to the official runtime storage model shape without manual castings
  const decision: ApprovalDecision = {
    status,
    note,
    decidedBy: reviewerRef,
  };

  ctx.logger.info(`Recording human authorization decision [${status}] targeting run token coordinate: ${runId}`);

  // 3. Persist the human intervention decision inside the underlying database logs
  await ctx.runStore.decideApproval(runId, decision);

  // 4. Construct the Runtime Context shape to trigger resumption
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

  // 5. Notify the async generator to resume the graph trajectory out of the pause gate state
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

export async function startRunAction(
  req: Request,
  res: Response,
  ctx: ControllerContext
): Promise<Response | void> {
  const paramsResult = StartRunParamsSchema.safeParse(req.params);

  const rawBody = (req.body && typeof req.body === 'object' && 'input' in req.body) 
    ? (req.body as Record<string, unknown>)['input'] 
    : req.body;
  const bodyResult = StartRunBodySchema.safeParse(rawBody);

  if (!paramsResult.success || !bodyResult.success) {
    const errorMsg = [...(paramsResult.error?.issues ?? []), ...(bodyResult.error?.issues ?? [])]
      .map(i => i.message).join(', ');
    return res.status(422).send({ message: errorMsg });
  }

  const { id: agentId } = paramsResult.data;

  const agent = ctx.agents.get(agentId);
  if (!agent) {
    return res.status(422).send({ message: `Unknown agent '${agentId}'` });
  }

  if (!ctx.consumeRateLimit(agentId)) {
    ctx.logger.warn(`Rate limit exceeded for agent '${agentId}'`);
    return res.status(429).send({ message: 'Rate limit exceeded for agent' });
  }

  // Greenfield Goal: Generate a tracking runId and return it immediately to the client
  const runId = randomUUID();
  ctx.logger.info(`Initialized agent thread [${agentId}] yielding tracking target ID: ${runId}`);

  // We return the initialization response metadata to let clients know where to stream from
  return res.status(202).send({ runId, status: 'accepted' });
}

export async function streamRunEventsAction(
  req: Request,
  res: FlushingResponse,
  ctx: ControllerContext
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

  // Construct a standard, type-safe AgentRunInput payload contract
  const runInput: AgentRunInput = {
    runId,
    agentId,
    input: {
      query: (req.query['query'] as string) || '',
      source: (req.query['source'] as string) || 'all',
    }
  };

  // Reconstruct a strict runtime context matching your RuntimeContext declarations
  const runtimeContext = {
    logger: ctx.logger,
    toolRegistry: ctx.toolRegistry,
    model: {} as any, // Resolved inside runtime factory tiers
    identity: 'authenticated-user',
    sessionStore: ctx.sessionStore,
    checkpointStore: ctx.checkpointStore,
    runStore: ctx.runStore,
    artifactSink: ctx.artifactSink,
    auditLogSink: ctx.auditLogSink,
    hardening: ctx.hardening,
  };

  try {
    // Consume the live async generator stream directly from your AgentRuntime engine file!
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

export async function triggerRunAction(
  req: Request,
  res: Response,
  ctx: ControllerContext
): Promise<Response> {
  const paramsResult = TriggerRunParamsSchema.safeParse(req.params);
  const bodyResult = GenericEventPayloadSchema.safeParse(req.body);

  if (!paramsResult.success || !bodyResult.success) {
    const errorMsg = [...(paramsResult.error?.issues ?? []), ...(bodyResult.error?.issues ?? [])]
      .map(i => i.message).join(', ');
    return res.status(422).send({ message: errorMsg });
  }

  const { source } = paramsResult.data;
  const { triggerId, query } = bodyResult.data;

  // 1. Scan the registered trigger list to locate a compliant engine binding rule match
  const matchedBinding = ctx.triggers.find(
    t => t.id === triggerId && t.source === source
  );

  if (!matchedBinding) {
    ctx.logger.warn(`Background event rejected: No active trigger binding maps to ID [${triggerId}] for source [${source}]`);
    return res.status(404).send({ message: `Trigger binding mapping unresolved for parameters.` });
  }

  const agentId = matchedBinding.agentId;
  const agent = ctx.agents.get(agentId);
  if (!agent) {
    return res.status(422).send({ message: `Configured agent mapping '${agentId}' does not exist inside active engine map.` });
  }

  const runId = randomUUID();
  ctx.logger.info(`Matched dynamic trigger event [${triggerId}] targeting source channel [${source}]. Provisioning background run sequence: ${runId}`);

  // 2. Map structural execution variables meeting complete runtime contract definitions
  const runInput: AgentRunInput = {
    runId,
    agentId,
    trigger: triggerId,
    input: {
      query,
      source: 'all',
    }
  };

  const runtimeContext = {
    logger: ctx.logger,
    toolRegistry: ctx.toolRegistry,
    model: {} as any, 
    identity: 'system-trigger-actor',
    sessionStore: ctx.sessionStore,
    checkpointStore: ctx.checkpointStore,
    runStore: ctx.runStore,
    artifactSink: ctx.artifactSink,
    auditLogSink: ctx.auditLogSink,
    hardening: ctx.hardening,
  };

  // 3. Launch execution loop thread asynchronously in the background container
  (async () => {
    const eventStream = ctx.runtime.run(runInput, runtimeContext);
    for await (const event of eventStream) {
      if (event.type === 'error') {
        ctx.logger.error(`Automated trigger run tracker [${runId}] threw error: ${event.data.message}`);
      }
    }
  })().catch(err => {
    ctx.logger.error(`Fatal background loop system processing crack encountered: ${(err as Error).message}`);
  });

  return res.status(202).send({ runId, status: 'trigger_processing_dispatched' });
}

export async function webhookRunAction(
  req: Request,
  res: Response,
  ctx: ControllerContext
): Promise<Response> {
  const paramsResult = WebhookRunParamsSchema.safeParse(req.params);
  const bodyResult = GenericEventPayloadSchema.safeParse(req.body);

  if (!paramsResult.success || !bodyResult.success) {
    const errorMsg = [...(paramsResult.error?.issues ?? []), ...(bodyResult.error?.issues ?? [])]
      .map(i => i.message).join(', ');
    return res.status(422).send({ message: errorMsg });
  }

  const { provider } = paramsResult.data;
  const { triggerId, query } = bodyResult.data;

  // Webhooks map provider handles across matching binding criteria strings
  const matchedBinding = ctx.triggers.find(
    t => t.id === triggerId && t.source === provider
  );

  if (!matchedBinding) {
    ctx.logger.warn(`Webhook invocation ignored: Provider mapping target [${provider}] has no matching configuration rules for ID [${triggerId}]`);
    return res.status(404).send({ message: `Webhook destination rule mapping is unconfigured.` });
  }

  const agentId = matchedBinding.agentId;
  const runId = randomUUID();
  ctx.logger.info(`Authorized external webhook alert originating from provider [${provider}] utilizing target identifier tracker: ${runId}`);

  const runInput: AgentRunInput = {
    runId,
    agentId,
    trigger: `webhook-${provider}`,
    input: {
      query,
      source: 'all',
    }
  };

  const runtimeContext = {
    logger: ctx.logger,
    toolRegistry: ctx.toolRegistry,
    model: {} as any,
    identity: `webhook-${provider}-actor`,
    sessionStore: ctx.sessionStore,
    checkpointStore: ctx.checkpointStore,
    runStore: ctx.runStore,
    artifactSink: ctx.artifactSink,
    auditLogSink: ctx.auditLogSink,
    hardening: ctx.hardening,
  };

  // Dispatch invocation pipeline loop background thread processing pass
  (async () => {
    const eventStream = ctx.runtime.run(runInput, runtimeContext);
    for await (const event of eventStream) {
      if (event.type === 'done') {
        ctx.logger.info(`Webhook orchestrated agent run thread [${runId}] successfully completed task actions.`);
      }
    }
  })().catch(err => {
    ctx.logger.error(`Fatal background loop system processing crack encountered: ${(err as Error).message}`);
  });

  return res.status(202).send({ runId, status: 'webhook_processing_dispatched' });
}
