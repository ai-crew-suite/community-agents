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
  TriggerRunParamsSchema,
} from '../schemas';
import type { ControllerContext } from './types';

/**
 * Dispatches background agentic execution loops driven by verified infrastructure cron parameters.
 * Enforces rigid principal tracking, prevents loose fire-and-forget background state leaks,
 * and maps rich structured trace diagnostics to corporate logging aggregates.
 *
 * @param req - The incoming Express web request container.
 * @param res - The outgoing Express response lifecycle controller.
 * @param ctx - The compiled internal business utility context wrapper instance.
 * @param userRef - The cryptographically verified service principal actor tracking this automated event.
 * @returns A Promise resolving to an asynchronous processing receipt payload response.
 * @throws InputError on malformed parameter configuration blocks.
 * @throws NotFoundError when requested trigger bindings cannot be mapped to the engine state.
 */
export async function triggerRunAction(
  req: Request,
  res: Response,
  ctx: ControllerContext,
  userRef: string,
): Promise<Response> {
  // Synchronous Perimeter Schema Validation Guards
  const paramsResult = TriggerRunParamsSchema.safeParse(req.params);
  const bodyResult = GenericEventPayloadSchema.safeParse(req.body);

  if (!paramsResult.success || !bodyResult.success) {
    const errorMsg = [...(paramsResult.error?.issues ?? []), ...(bodyResult.error?.issues ?? [])]
      .map(i => i.message).join(', ');

    ctx.logger.warn(`Infrastructure Validation Drop: Automated trigger mapping parameters mismatched schema contracts`, {
      userRef,
      path: req.path
    });
    throw new InputError(`Invalid trigger event criteria constraints: ${errorMsg}`);
  }

  const { source } = paramsResult.data;
  const { triggerId, query } = bodyResult.data;

  // Active Governance Binding Resolution Layer
  const matchedBinding = ctx.triggers.find(t => t.id === triggerId && t.source === source);
  if (!matchedBinding) {
    ctx.logger.warn(`Background event rejected: No active trigger binding maps to requested orchestration context`, {
      triggerId,
      source,
      userRef
    });
    throw new NotFoundError(`Trigger binding mapping unresolved for parameters: source=${source}, triggerId=${triggerId}`);
  }

  const agentId = matchedBinding.agentId;
  if (!ctx.agents.has(agentId)) {
    throw new InputError(`Configured agent mapping '${agentId}' does not exist inside active engine configurations.`);
  }

  const runId = randomUUID();

  // Write logs with structured key-value metadata blocks
  ctx.logger.info(`Dispatched automated infrastructure run thread via background trigger gateway`, {
    runId,
    triggerId,
    source,
    agentId,
    userRef,
    executionType: 'automated_background_cron'
  });

  const runInput: AgentRunInput = {
    runId,
    agentId,
    trigger: triggerId,
    input: { query, source: 'all' }
  };

  // Forward the verified Service Principal string immutably into runtime execution boundaries
  const runtimeContext: RunContext = {
    logger: ctx.logger,
    toolRegistry: ctx.toolRegistry,
    model: {} as any, // Injected downstream via execution provider module federation mappings
    identity: userRef,
    sessionStore: ctx.sessionStore,
    checkpointStore: ctx.checkpointStore,
    runStore: ctx.runStore,
    artifactSink: ctx.artifactSink,
    auditLogSink: ctx.auditLogSink,

    // Guarantee that a background cron can never loop indefinitely by enforcing defensive defaults
    hardening: {
      timeoutMs: ctx.hardening?.timeoutMs || 120000, // Hard stop at 2 minutes default safety boundary for background triggers
      maxRetries: ctx.hardening?.maxRetries || 3,
      retryBackoffMs: ctx.hardening?.retryBackoffMs || 1000,
      maxTotalTokens: ctx.hardening?.maxTotalTokens || 50000, // Strict token limit bounds to avoid API cost spikes on automation runaways
      ...ctx.hardening
    },
  };

  // Hardened Asynchronous Background Loop Enclosure
  // Executes outside the HTTP response thread but traps all step exceptions to prevent dangling promise leakage
  (async () => {
    const eventStream = ctx.runtime.run(runInput, runtimeContext);
    for await (const event of eventStream) {
      // Intercept asynchronous execution failures reported via event tags
      if (event.type === 'error') {
        ctx.logger.error(`Automated background run iteration reported engine failure`, {
          runId,
          triggerId,
          agentId,
          userRef,
          errorCode: event.data.code,
          errorMessage: event.data.message,
          retryable: event.data.retryable
        });
      }
    }
  })().catch(err => {
    // Advanced Diagnostic Capture: Pull rich contextual fields and error names natively
    ctx.logger.error(`Fatal background loop system processing crack encountered on automated run tracker`, {
      runId,
      triggerId,
      agentId,
      userRef,
      errorName: err.name || 'UnknownError',
      errorMessage: err.message || String(err),
      errorStack: err.stack // Track full structural trace lines inside backend aggregator stores for rapid troubleshooting
    });
  });

  return res.status(202).send({ runId, status: 'trigger_processing_dispatched' });
}
