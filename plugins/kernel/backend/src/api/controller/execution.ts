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
import { StartRunParamsSchema, StartRunBodySchema, StreamRunParamsSchema } from './schemas';
import type { ControllerContext } from '../../types';

interface FlushingResponse extends Response {
  flush?: () => void;
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

  if (!paramsResult.success) {
    return res.status(422).send({ message: paramsResult.error.issues.map(i => i.message).join(', ') });
  }
  if (!bodyResult.success) {
    return res.status(422).send({ message: bodyResult.error.issues.map(i => i.message).join(', ') });
  }

  const { id: agentId } = paramsResult.data;
  const { query } = bodyResult.data;

  const agent = ctx.agents.get(agentId);
  if (!agent) {
    return res.status(422).send({ message: `Unknown agent '${agentId}'` });
  }

  if (!ctx.consumeRateLimit(agentId)) {
    ctx.logger.warn(`Rate limit exceeded for agent '${agentId}'`);
    return res.status(429).send({ message: 'Rate limit exceeded for agent' });
  }

  ctx.logger.info(`Successfully authorized run sequence invocation loop targeting agent: ${agentId} with prompt: "${query}"`);
  return res.end();
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

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    Connection: 'keep-alive',
    'Cache-Control': 'no-cache',
  });

  const sinceSeq = ctx.parseLastEventId(req.header('last-event-id'));
  const steps = (await ctx.runStore?.listRunSteps(runId, sinceSeq)) ?? [];

  const writeEvent = (targetRes: FlushingResponse, eventType: string, eventData: unknown, seq?: number): void => {
    if (typeof seq === 'number') {
      targetRes.write(`id: ${seq}\n`);
    }
    targetRes.write(`event: ${eventType}\n`);
    targetRes.write(`data: ${JSON.stringify(eventData)}\n\n`);
  };

  for (const step of steps) {
    const event = ctx.fromStoredStep(step.type, step.payload);
    if (event) {
      writeEvent(res, event.type, event.data, step.seq);
      res.flush?.(); 
    }
  }
  return res.end();
}
