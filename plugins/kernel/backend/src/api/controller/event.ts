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
import { AgentRunInput } from '@ai-crew-suite/plugin-kernel-node';
import {
  GenericEventPayloadSchema,
  TriggerRunParamsSchema,
  WebhookRunParamsSchema,
} from './schemas';
import type { ControllerContext } from './types';

export async function triggerRunAction(
  req: Request,
  res: Response,
  ctx: ControllerContext,
  _userRef: string, // Mandatory parameter enforcing non-repudiation at compile time
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

  const matchedBinding = ctx.triggers.find(t => t.id === triggerId && t.source === source);
  if (!matchedBinding) {
    ctx.logger.warn(`Background event rejected: No active trigger binding maps to ID [${triggerId}] for source [${source}]`);
    return res.status(404).send({ message: `Trigger binding mapping unresolved for parameters.` });
  }

  const agentId = matchedBinding.agentId;
  if (!ctx.agents.has(agentId)) {
    return res.status(422).send({ message: `Configured agent mapping '${agentId}' does not exist inside active engine map.` });
  }

  const runId = randomUUID();
  ctx.logger.info(`Matched dynamic trigger event [${triggerId}] targeting source channel [${source}]. Provisioning background run sequence: ${runId}`);

  const runInput: AgentRunInput = {
    runId,
    agentId,
    trigger: triggerId,
    input: { query, source: 'all' }
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
  ctx: ControllerContext,
  _userRef: string, // Mandatory parameter enforcing non-repudiation at compile time
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

  const matchedBinding = ctx.triggers.find(t => t.id === triggerId && t.source === provider);
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
    input: { query, source: 'all' }
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
