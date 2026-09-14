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
import { InputError, NotFoundError } from '@backstage/errors';
import {
  AgentRunInput,
  RunContext,
} from '@ai-crew-suite/plugin-kernel-node';
import {
  GenericEventPayloadSchema,
  WebhookRunParamsSchema,
} from './schemas';
import type { ControllerContext } from './types';

/**
 * Endpoint tracking and execution wrapper processing incoming third-party webhooks.
 * Enforces rigid principal tracking, handles ghost agent blocks, and unifies log tracing.
 *
 * @param req - The incoming Express web request container.
 * @param res - The outgoing Express response lifecycle controller.
 * @param ctx - The compiled internal business utility context wrapper instance.
 * @param userRef - The cryptographically verified service principal actor tracking this webhook event.
 * @returns A Promise resolving to an asynchronous processing receipt payload response.
 * @throws InputError on malformed parameter configuration blocks or missing agent references.
 * @throws NotFoundError when requested webhook provider bindings cannot be mapped to the engine state.
 */
export async function webhookRunAction(
  req: Request,
  res: Response,
  ctx: ControllerContext,
  userRef: string,
): Promise<Response> {
  // Synchronous Perimeter Schema Validation Guards
  const paramsResult = WebhookRunParamsSchema.safeParse(req.params);
  const bodyResult = GenericEventPayloadSchema.safeParse(req.body);

  if (!paramsResult.success || !bodyResult.success) {
    const errorMsg = [...(paramsResult.error?.issues ?? []), ...(bodyResult.error?.issues ?? [])]
      .map(i => i.message).join(', ');

    ctx.logger.warn(`Webhook Validation Drop: External payload mapping parameter mismatch`, {
      userRef,
      path: req.path
    });
    throw new InputError(`Invalid webhook invocation criteria constraints: ${errorMsg}`);
  }

  const { provider } = paramsResult.data;
  const { triggerId, query } = bodyResult.data;

  // Security Hardening: Sanitize input parameter string characters to prevent cross-cutting log injection
  const safeProviderName = provider.replace(/[^a-zA-Z0-9_-]/g, '');
  const safeTriggerId = triggerId.replace(/[^a-zA-Z0-9_-]/g, '');

  // Active Governance Binding Resolution Layer
  const matchedBinding = ctx.triggers.find(t => t.id === safeTriggerId && t.source === safeProviderName);
  if (!matchedBinding) {
    ctx.logger.warn(`Webhook invocation ignored: Provider mapping target has no matching configuration rules`, {
      triggerId: safeTriggerId,
      provider: safeProviderName,
      userRef
    });
    throw new NotFoundError(`Webhook destination rule mapping is unconfigured for provider=${safeProviderName}, triggerId=${safeTriggerId}`);
  }

  const agentId = matchedBinding.agentId;

  // Guard Check: Trap Ghost Agent references early to block broken background allocations
  if (!ctx.agents.has(agentId)) {
    throw new InputError(`Configured webhook target agent mapping '${agentId}' does not exist inside active engine configurations.`);
  }

  const runId = randomUUID();

  // Compliance: Write logs with structured key-value metadata blocks including request size parameters
  ctx.logger.info(`Authorized external webhook alert originating from provider boundary`, {
    runId,
    triggerId: safeTriggerId,
    provider: safeProviderName,
    agentId,
    userRef,
    executionType: 'external_infrastructure_webhook',
    payloadSizeBytes: req.headers?.['content-length'] ? Number(req.headers['content-length']) : JSON.stringify(req.body).length,
    clientIp: req.ip || req.socket?.remoteAddress
  });

  const runInput: AgentRunInput = {
    runId,
    agentId,
    trigger: `webhook-${safeProviderName}`,
    input: { query, source: 'all' }
  };

  // Forward the verified Service Principal string immutably into runtime execution boundaries
  const runtimeContext: RunContext = {
    logger: ctx.logger,
    toolRegistry: ctx.toolRegistry,
    model: {} as any, // Injected downstream via provider module mappings
    identity: userRef,
    sessionStore: ctx.sessionStore,
    checkpointStore: ctx.checkpointStore,
    runStore: ctx.runStore,
    artifactSink: ctx.artifactSink,
    auditLogSink: ctx.auditLogSink,
    hardening: {
      timeoutMs: ctx.hardening?.timeoutMs || 120000, // Bound webhook background runs to 2-minute default safety ceilings
      maxRetries: ctx.hardening?.maxRetries || 3,
      retryBackoffMs: ctx.hardening?.retryBackoffMs || 1000,
      maxTotalTokens: ctx.hardening?.maxTotalTokens || 50000,
      ...ctx.hardening
    },
  };

  // Isolated Background Execution Loop Enclosure
  (async () => {
    const eventStream = ctx.runtime.run(runInput, runtimeContext);
    for await (const event of eventStream) {
      if (event.type === 'done') {
        ctx.logger.info(`Webhook orchestrated agent run thread successfully completed task actions`, {
          runId,
          triggerId: safeTriggerId,
          provider: safeProviderName,
          userRef
        });
      }
      if (event.type === 'error') {
        ctx.logger.error(`Webhook background run iteration reported engine failure`, {
          runId,
          triggerId: safeTriggerId,
          provider: safeProviderName,
          userRef,
          errorCode: event.data.code,
          errorMessage: event.data.message
        });
      }
    }
  })().catch(err => {
    // Defensive Error Safety: Ensure fallback parameters prevent undefined crashes in log files
    const finalError = err || new Error('Opaque un-handled microtask worker thread exception');
    ctx.logger.error(`Fatal background loop system processing crack encountered on webhook run tracker`, {
      runId,
      triggerId: safeTriggerId,
      provider: safeProviderName,
      userRef,
      errorName: finalError.name || 'UnknownError',
      errorMessage: finalError.message || String(finalError),
      errorStack: finalError.stack
    });
  });

  return res.status(202).send({ runId, status: 'webhook_processing_dispatched' });
}
