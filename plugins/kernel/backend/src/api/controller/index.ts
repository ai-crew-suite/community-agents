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
import { LoggerService } from '@backstage/backend-plugin-api';
import { NotAllowedError } from '@backstage/errors';
import {
  AgentDefinition,
  ArtifactSink,
  AuditLogSink,
  CheckpointStore,
  EmbeddingsSource,
  AgentEvent,
  AugmentationIndexer,
  RetrievalPipeline,
  RunStore,
  SessionStore,
  ToolRegistry,
  TriggerBinding,
} from '@ai-crew-suite/plugin-kernel-node';
import { AgentRuntime } from '../../runtime/AgentRuntime';
import type { HardeningOptions, RouteController } from '../../types';
import { ControllerContext } from '../../types';
import { createEmbeddingsAction, deleteEmbeddingsAction, getEmbeddingsAction } from './embedding';
import { startRunAction, streamRunEventsAction } from './execution';

interface AuthenticatedUserRequest {
  user?: {
    identity?: {
      userEntityId?: string;
    };
  };
}

export class WorkflowController implements RouteController {
  private readonly rateLimitBucket = new Map<string, number[]>();

  constructor(
    private readonly logger: LoggerService,
    private readonly runtime: AgentRuntime,
    private readonly toolRegistry: ToolRegistry,
    private readonly augmentationIndexer: AugmentationIndexer,
    private readonly agents: Map<string, AgentDefinition>,
    private readonly retrievalPipeline?: RetrievalPipeline,
    private readonly sessionStore?: SessionStore,
    private readonly checkpointStore?: CheckpointStore,
    private readonly runStore?: RunStore,
    private readonly artifactSink?: ArtifactSink,
    private readonly auditLogSink?: AuditLogSink,
    private readonly triggers: TriggerBinding[] = [],
    private readonly hardening: HardeningOptions = {},
  ) {}

  /**
   * High-cohesion lookup context grouping all structural dependencies
   * into a single parameter footprint passed down to modular sub-actions.
   */
  private get context(): ControllerContext {
    return {
      logger: this.logger,
      augmentationIndexer: this.augmentationIndexer,
      retrievalPipeline: this.retrievalPipeline,
      runStore: this.runStore,
      agents: this.agents,
      validateSource: this.validateSource.bind(this),
      consumeRateLimit: this.consumeRateLimit.bind(this),
      parseLastEventId: this.parseLastEventId.bind(this),
      fromStoredStep: this.fromStoredStep.bind(this),
    };
  }

  private isAuthenticated(req: Request): boolean {
    const userRequest = req as unknown as AuthenticatedUserRequest;
    return Boolean(userRequest.user?.identity?.userEntityId);
  }

  private identity(req: Request): string {
    const userRequest = req as unknown as AuthenticatedUserRequest;
    const userEntityId = userRequest.user?.identity?.userEntityId;
    if (!userEntityId) {
      throw new NotAllowedError('Unauthenticated request: no verified UserRef available');
    }
    return userEntityId;
  }

/**
 * ============================================================================
 * Public Route Delegations (Implements RouteController natively)
 * ============================================================================
 */

  public createEmbeddings = async (req: Request, res: Response): Promise<Response> => {
    if (!this.isAuthenticated(req)) return res.status(401).send({ message: 'Unauthorized' });
    return createEmbeddingsAction(req, res, this.context);
  };

  public deleteEmbeddings = async (req: Request, res: Response): Promise<Response> => {
    if (!this.isAuthenticated(req)) return res.status(401).send({ message: 'Unauthorized' });
    return deleteEmbeddingsAction(req, res, this.context);
  };

  public getEmbeddings = async (req: Request, res: Response): Promise<Response> => {
    if (!this.isAuthenticated(req)) return res.status(401).send({ message: 'Unauthorized' });
    return getEmbeddingsAction(req, res, this.context);
  };

  public listAgents = async (req: Request, res: Response): Promise<Response> => {
    if (!this.isAuthenticated(req)) return res.status(401).send({ message: 'Unauthorized' });
    const items = [...this.agents.values()].map(agent => ({ id: agent.id, workflowRef: agent.workflowRef }));
    return res.status(200).send({ agents: items });
  };

  public startRun = async (req: Request, res: Response): Promise<Response | void> => {
    if (!this.isAuthenticated(req)) return res.status(401).send({ message: 'Unauthorized' });
    return startRunAction(req, res, this.context);
  };

  public streamRunEvents = async (req: Request, res: Response): Promise<Response | void> => {
    if (!this.isAuthenticated(req)) return res.status(401).send({ message: 'Unauthorized' });
    this.identity(req);
    return streamRunEventsAction(req, res, this.context);
  };

  public approveRun = async (req: Request, res: Response): Promise<Response | void> => {
    if (!this.isAuthenticated(req)) return res.status(401).send({ message: 'Unauthorized' });
    this.identity(req);
    return res.end();
  };

  public triggerRun = async (req: Request, res: Response): Promise<Response> => {
    if (!this.isAuthenticated(req)) return res.status(401).send({ message: 'Unauthorized' });
    return res.status(501).send({ message: 'Trigger dispatch deferred during greenfield rebuild' });
  };

  public webhookRun = async (req: Request, res: Response): Promise<Response> => {
    if (!this.isAuthenticated(req)) return res.status(401).send({ message: 'Unauthorized' });
    return res.status(501).send({ message: 'Webhook dispatch deferred during greenfield rebuild' });
  };

  /**
   * ============================================================================
   * Private Helper Core Methods
   * ============================================================================
   */

  private validateSource(source: string | undefined): EmbeddingsSource {
    if (!source || source === 'all') return 'all' as EmbeddingsSource;
    return source as EmbeddingsSource;
  }

  private consumeRateLimit(agentId: string): boolean {
    const limit = this.hardening.rateLimitPerMinute;
    if (!limit || limit <= 0) return true;
    const now = Date.now();
    const cutoff = now - 60_000;
    const bucket = this.rateLimitBucket.get(agentId) ?? [];
    const nextBucket = bucket.filter(timestamp => timestamp >= cutoff);
    if (nextBucket.length >= limit) {
      this.rateLimitBucket.set(agentId, nextBucket);
      return false;
    }
    nextBucket.push(now);
    this.rateLimitBucket.set(agentId, nextBucket);
    return true;
  }

  private parseLastEventId(value?: string): number {
    if (!value) return 0;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }

  private fromStoredStep(type: string, payload: unknown): AgentEvent | undefined {
    const allowedTypes = ['step', 'token', 'tool_call', 'tool_result', 'usage', 'approval_request', 'artifact', 'done', 'error'] as const;
    if (allowedTypes.includes(type as never)) {
      return { type, data: payload as never } as AgentEvent;
    }
    return undefined;
  }
}
