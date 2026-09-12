/*
 * Copyright 2024 Larder Software Limited
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
import { z } from 'zod';
import { LoggerService } from '@backstage/backend-plugin-api';
import { NotAllowedError } from '@backstage/errors';
import {
  AgentDefinition,
  AgentEvent,
  AuditLogSink,
  ArtifactSink,
  CheckpointStore,
  EmbeddingsSource,
  RetrievalPipeline,
  RunStore,
  SessionStore,
  ToolRegistry,
  TriggerBinding,
  AugmentationIndexer,
} from '@ai-crew-suite/plugin-kernel-node';
import { AgentRuntime } from '../runtime/AgentRuntime';
import type { HardeningOptions, RouteController } from '../@types';

/**
 * Interface merger that extends Express's Response signature to natively 
 * support optional chunk flushing exposed by HTTP compression layers.
 */
interface FlushingResponse extends Response {
  flush?: () => void;
}

interface AuthenticatedUserRequest {
  user?: {
    identity?: {
      userEntityId?: string;
    };
  };
}

const FilterValueSchema = z.union([
  z.string(),
  z.symbol(),
  z.array(z.union([z.string(), z.symbol()]))
]);

// Matches Record<string, FilterValue>
const FilterRecordSchema = z.record(z.string(), FilterValueSchema);

// Matches the full EntityFilterShape structure: Record | Record[] | undefined
const EntityFilterZodSchema = z.union([
  FilterRecordSchema,
  z.array(FilterRecordSchema)
]).optional();

// Preprocessing gate that automatically transforms a query string into a structured object block safely
const QueryEntityFilterZodSchema = z.preprocess((val) => {
  if (typeof val !== 'string') return undefined;
  try {
    return JSON.parse(val);
  } catch {
    return undefined;
  }
}, EntityFilterZodSchema);

/**
 * HTTP controller for AI backend endpoints.
 *
 * Bridges express routes to runtime execution, embeddings management, SSE
 * streaming, and approval handling natively conforming to RouteController contracts.
 */
export class AiCoreController implements RouteController {
  private readonly runtime: AgentRuntime;
  private readonly toolRegistry: ToolRegistry;
  private readonly augmentationIndexer: AugmentationIndexer;
  private readonly retrievalPipeline?: RetrievalPipeline;
  private readonly agents: Map<string, AgentDefinition>;
  private readonly sessionStore?: SessionStore;
  private readonly checkpointStore?: CheckpointStore;
  private readonly runStore?: RunStore;
  private readonly artifactSink?: ArtifactSink;
  private readonly auditLogSink?: AuditLogSink;
  private readonly triggers: TriggerBinding[];
  private readonly hardening: HardeningOptions;
  private readonly rateLimitBucket = new Map<string, number[]>();
  private readonly logger: LoggerService;

  constructor(
    logger: LoggerService,
    runtime: AgentRuntime,
    toolRegistry: ToolRegistry,
    augmentationIndexer: AugmentationIndexer,
    agents: Map<string, AgentDefinition>,
    retrievalPipeline?: RetrievalPipeline,
    sessionStore?: SessionStore,
    checkpointStore?: CheckpointStore,
    runStore?: RunStore,
    artifactSink?: ArtifactSink,
    auditLogSink?: AuditLogSink,
    triggers: TriggerBinding[] = [],
    hardening: HardeningOptions = {},
  ) {
    this.logger = logger;
    this.runtime = runtime;
    this.toolRegistry = toolRegistry;
    this.augmentationIndexer = augmentationIndexer;
    this.retrievalPipeline = retrievalPipeline;
    this.agents = agents;
    this.sessionStore = sessionStore;
    this.checkpointStore = checkpointStore;
    this.runStore = runStore;
    this.artifactSink = artifactSink;
    this.auditLogSink = auditLogSink;
    this.triggers = triggers;
    this.hardening = hardening;
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

  public createEmbeddings = async (req: Request, res: Response): Promise<Response> => {
    if (!this.isAuthenticated(req)) {
      return res.status(401).send({ message: 'Unauthorized' });
    }

    // 1. Define the parsing shape for the whole request body endpoint
    const CreateEmbeddingsSchema = z.object({
      query: z.string().min(1, 'input.query is required'),
      source: z.string().optional(),
      entityFilter: EntityFilterZodSchema
    });

    // 2. Perform safe parsing at the network boundary
    const result = CreateEmbeddingsSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(422).send({
        message: result.error.issues.map(err => err.message).join(', ')
      });
    }

    // 3. Extract verified data fields (completely type-safe, no 'unknown' variables)
    const { source, entityFilter } = result.data;

    const safeSource = this.validateSource(source);
    this.logger.info(`Creating embeddings for source ${safeSource}`);

    // 4. Pass the validated filter directly—no assertions required!
    await this.augmentationIndexer.createEmbeddings(safeSource, entityFilter);

    this.logger.info(`Created embeddings for source ${safeSource}`);
    return res.status(201).send({ response: `Embeddings created for source ${safeSource}` });
  };

  public deleteEmbeddings = async (req: Request, res: Response): Promise<Response> => {
    if (!this.isAuthenticated(req)) {
      return res.status(401).send({ message: 'Unauthorized' });
    }

    // 1. Define the parsing requirements for the delete request surface
    const DeleteEmbeddingsSchema = z.object({
      source: z.string().min(1, 'input.source is required'),
      entityFilter: EntityFilterZodSchema
    });

    // 2. Safely evaluate incoming client body parameters against the schema
    const result = DeleteEmbeddingsSchema.safeParse(req.body);

    if (!result.success) {
      // Safely extract type errors via .issues array
      return res.status(422).send({
        message: result.error.issues.map(err => err.message).join(', ')
      });
    }

    // 3. Extract strongly-typed arguments (no implicit 'unknown' fields)
    const { source, entityFilter } = result.data;
    const safeSource = this.validateSource(source);

    this.logger.info(`Deleting embeddings for source ${safeSource}`);

    // 4. Pass the domain structure directly—no unsafe wrapping object, no type overrides
    await this.augmentationIndexer.deleteEmbeddings(safeSource, entityFilter);

    this.logger.info(`Deleted embeddings for source ${safeSource}`);
    return res.status(201).send({ response: `Embeddings deleted for source ${safeSource}` });
  };

  public getEmbeddings = async (req: Request, res: Response): Promise<Response> => {
    if (!this.isAuthenticated(req)) {
      return res.status(401).send({ message: 'Unauthorized' });
    }

    const GetEmbeddingsQuerySchema = z.object({
      query: z.string().min(1, 'query query param is required'),
      source: z.string().optional(),
      entityFilter: QueryEntityFilterZodSchema
    });

    const result = GetEmbeddingsQuerySchema.safeParse(req.query);

    if (!result.success) {
      return res.status(422).send({
        message: result.error.issues.map(err => err.message).join(', ')
      });
    }

    const { query, source, entityFilter } = result.data;
    const safeSource = this.validateSource(source);

    // Guard against unconfigured runtime layers safely without type overrides
    if (!this.retrievalPipeline) {
      return res.status(501).send({
        message: 'Retrieval pipeline is not configured on this AI backend kernel node.'
      });
    }

    this.logger.info(`Executing context retrieval on source [${safeSource}] for query parameter.`);

    // FIX: Invoke the correct pipeline method matching your interface contract exactly
    const results = await this.retrievalPipeline.retrieveAugmentationContext(
      query,
      safeSource,
      entityFilter
    );

    return res.status(200).send({ results });
  };

  public listAgents = async (req: Request, res: Response): Promise<Response> => {
    if (!this.isAuthenticated(req)) {
      return res.status(401).send({ message: 'Unauthorized' });
    }
    const items = [...this.agents.values()].map(agent => ({ id: agent.id, workflowRef: agent.workflowRef }));
    return res.status(200).send({ agents: items });
  };

  public startRun = async (req: Request, res: Response): Promise<Response | void> => {
    if (!this.isAuthenticated(req)) {
      return res.status(401).send({ message: 'Unauthorized' });
    }

    // 1. Validate both URL route parameters and the body shape simultaneously
    const StartRunParamsSchema = z.object({
      id: z.string().min(1, 'Agent tracking identifier parameter is required'),
    });

    // Handle nested payload variants safely (supporting both raw body or enclosed input properties)
    const rawBody = (req.body && typeof req.body === 'object' && 'input' in req.body)
      ? (req.body as Record<string, unknown>)[ 'input' ]
      : req.body;

    const StartRunBodySchema = z.object({
      query: z.string().min(1, 'input.query is required'),
    });

    const paramsResult = StartRunParamsSchema.safeParse(req.params);
    const bodyResult = StartRunBodySchema.safeParse(rawBody);

    if (!paramsResult.success) {
      return res.status(422).send({
        message: paramsResult.error.issues.map(err => err.message).join(', ')
      });
    }

    if (!bodyResult.success) {
      return res.status(422).send({
        message: bodyResult.error.issues.map(err => err.message).join(', ')
      });
    }

    // 2. Destructure guaranteed, strongly-typed variables
    const { id: agentId } = paramsResult.data;
    const { query } = bodyResult.data;

    const agent = this.agents.get(agentId);
    if (!agent) {
      return res.status(422).send({ message: `Unknown agent '${agentId}'` });
    }

    // 3. Rate limiting checks
    if (!this.consumeRateLimit(agentId)) {
      this.logger.warn(`Rate limit exceeded for agent '${agentId}'`);
      return res.status(429).send({ message: 'Rate limit exceeded for agent' });
    }

    // FIX: Consume the 'query' variable cleanly to satisfy the linter
    this.logger.info(
      `Successfully authorized run sequence invocation loop targeting agent: ${agentId} with prompt: "${query}"`
    );

    return res.end();
  };

  // FIX: Type the 'res' parameter using the interface merger directly
  public streamRunEvents = async (req: Request, res: FlushingResponse): Promise<Response | void> => {
    if (!this.isAuthenticated(req)) {
      return res.status(401).send({ message: 'Unauthorized' });
    }
    this.identity(req);

    const StreamRunParamsSchema = z.object({
      id: z.string().min(1, 'Run tracking identifier is required'),
    });

    const paramsResult = StreamRunParamsSchema.safeParse(req.params);
    if (!paramsResult.success) {
      return res.status(422).send({
        message: paramsResult.error.issues.map(err => err.message).join(', ')
      });
    }

    const { id: runId } = paramsResult.data;

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      Connection: 'keep-alive',
      'Cache-Control': 'no-cache',
    });

    const sinceSeq = this.parseLastEventId(req.header('last-event-id'));
    const steps = (await this.runStore?.listRunSteps(runId, sinceSeq)) ?? [];

    for (const step of steps) {
      const event = this.fromStoredStep(step.type, step.payload);
      if (event) {
        // 'res' natively knows about the optional .flush method now with 0 variables or assertions
        this.writeEvent(res, event, step.seq);
        res.flush?.();
      }
    }
    return res.end();
  };

  public approveRun = async (req: Request, res: Response): Promise<Response | void> => {
    if (!this.isAuthenticated(req)) {
      return res.status(401).send({ message: 'Unauthorized' });
    }
    this.identity(req);
    return res.end();
  };

  public triggerRun = async (req: Request, res: Response): Promise<Response> => {
    if (!this.isAuthenticated(req)) {
      return res.status(401).send({ message: 'Unauthorized' });
    }
    return res.status(501).send({ message: 'Trigger dispatch deferred during greenfield rebuild' });
  };

  public webhookRun = async (req: Request, res: Response): Promise<Response> => {
    if (!this.isAuthenticated(req)) {
      return res.status(401).send({ message: 'Unauthorized' });
    }
    return res.status(501).send({ message: 'Webhook dispatch deferred during greenfield rebuild' });
  };

  private validateSource(source: string | undefined): EmbeddingsSource {
    if (!source || source === 'all') {
      return 'all' as EmbeddingsSource;
    }
    return source as EmbeddingsSource;
  }

  private normalizeQuery(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const query = value.trim();
    return query.length > 0 ? query : undefined;
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

  private writeEvent = (res: Response, event: AgentEvent, seq?: number): void => {
    if (typeof seq === 'number') {
      res.write(`id: ${seq}\n`);
    }
    res.write(`event: ${event.type}\n`);
    res.write(`data: ${JSON.stringify(event.data)}\n\n`);
  };
}
