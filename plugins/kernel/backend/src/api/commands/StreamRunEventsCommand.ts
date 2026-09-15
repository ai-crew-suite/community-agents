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
// plugins/kernel/backend/src/api/commands/StreamRunEventsCommand.ts
import { InputError, NotAllowedError, NotFoundError, NotImplementedError } from '@backstage/errors';
import { PermissionsService, BackstageCredentials } from '@backstage/backend-plugin-api';
import { ResourcePermission } from '@backstage/plugin-permission-common';
import {
  AgentRunInput,
  ArtifactSink,
  AuditLogSink,
  CheckpointStore,
  HardeningOptions,
  RunRecord,
  RunStore,
  SessionStore,
  ToolRegistry,
} from '@ai-crew-suite/plugin-kernel-node';
import { BaseKernelCommand } from './BaseKernelCommand';
import { CommandContext, PackedRequestInput, StreamExecutionFunction, FlushingResponse } from './types';
import { aiPermissions } from '../permissions';
import { StreamRunParamsSchema } from '../controller/schemas';
import { AgentRuntime } from '../../runtime/AgentRuntime';

type StreamRunValidatedInput = {
  readonly runId: string;
  readonly agentId: string;
  readonly query: string;
  readonly source: string;
  readonly incomingLastEventId?: string;
};

export class StreamRunEventsCommand extends BaseKernelCommand<StreamRunValidatedInput, StreamExecutionFunction> {
  private readonly credentials: BackstageCredentials;

  public constructor(
    private readonly permissions: PermissionsService,
    private readonly agentRuntime: AgentRuntime,
    private readonly runStore?: RunStore,
    private readonly toolRegistry?: ToolRegistry,
    private readonly sessionStore?: SessionStore,
    private readonly checkpointStore?: CheckpointStore,
    private readonly artifactSink?: ArtifactSink,
    private readonly auditLogSink?: AuditLogSink,
    private readonly hardening?: HardeningOptions,
    credentials?: BackstageCredentials
  ) {
    super();
    if (!credentials) {
      throw new NotAllowedError('Perimeter Authentication Failure: Request contains empty or unverified token principals.');
    }
    this.credentials = credentials;
  }

  protected verifyInfrastructureDependencies(): void {
    if (!this.runStore) {
      throw new NotImplementedError('Run persistence store is not configured on this AI backend kernel node.');
    }
  }

  protected validate(input: PackedRequestInput, context: CommandContext): StreamRunValidatedInput {
    const paramsResult = StreamRunParamsSchema.safeParse(input.params);
    if (!paramsResult.success) {
      const errorMsg = paramsResult.error.issues.map(i => i.message).join(', ');
      context.logger.warn('SSE Stream Initialization Dropped: Path parameters mismatched schema contracts', {
        userRef: context.actorIdentity,
      });
      throw new InputError(`Invalid event stream configuration criteria: ${errorMsg}`);
    }

    const { id: runId } = paramsResult.data;

    // Safely parse index headers and query string components using string literal maps
    const headersMap = input.headers as Record<string, string | string[] | undefined>;
    const queryMap = input.query as Record<string, string | string[] | undefined>;

    const agentIdParam = queryMap['agentId'];
    const queryParam = queryMap['query'];
    const sourceParam = queryMap['source'];
    const lastEventIdHeader = headersMap['last-event-id'];
    const lastEventIdQuery = queryMap['lastEventId'];

    const agentId = typeof agentIdParam === 'string' ? agentIdParam : 'default-agent';
    const query = typeof queryParam === 'string' ? queryParam : '';
    const source = typeof sourceParam === 'string' ? sourceParam : 'all';

    let incomingLastEventId: string | undefined = undefined;
    if (typeof lastEventIdHeader === 'string') {
      incomingLastEventId = lastEventIdHeader;
    } else if (typeof lastEventIdQuery === 'string') {
      incomingLastEventId = lastEventIdQuery;
    }

    return {
      runId,
      agentId,
      query,
      source,
      incomingLastEventId,
    };
  }

  protected async authorize(input: StreamRunValidatedInput, _context: CommandContext): Promise<void> {
    // 1. Secure IDOR Check: Prior to returning stream, ensure target entity run records are resolvable
    const runStore = this.runStore!;
    let activeRunRecord: RunRecord | undefined = undefined;

    try {
      activeRunRecord = await runStore.getRun(input.runId);
    } catch (storeError: unknown) {
      throw new Error(`An infrastructure exception blocked event stream lookup channels: ${storeError}`);
    }

    if (!activeRunRecord) {
      throw new NotFoundError(`The requested workflow execution thread '${input.runId}' could not be resolved.`);
    }

    // 2. Section E.3 Authorization Check mapping against permission framework rules
    const targetPermission = aiPermissions.runRead as ResourcePermission<string>;
    const decisions = await this.permissions.authorize(
      [{ permission: targetPermission, resourceRef: input.runId }],
      { credentials: this.credentials }
    );

    const [mainDecision] = decisions;
    if (mainDecision?.result === 'DENY') {
      throw new NotAllowedError(`Access Denied: Actor lacks required scope: ${aiPermissions.runRead.name}`);
    }
  }

  protected async handle(input: StreamRunValidatedInput, context: CommandContext): Promise<StreamExecutionFunction> {
    // Return a lazy execution function payload handover block to let adaptCommand handle real-time HTTP mutations safely
    return async (res: FlushingResponse): Promise<void> => {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
      });

      const writeEvent = (eventType: string, eventData: unknown, seq?: number): boolean => {
        if (typeof seq === 'number') res.write(`id: ${seq}\n`);
        res.write(`event: ${eventType}\n`);
        return res.write(`data: ${JSON.stringify(eventData)}\n\n`);
      };

      let sequenceCounter = 0;
      if (input.incomingLastEventId && /^\d+$/.test(input.incomingLastEventId)) {
        sequenceCounter = Number.parseInt(input.incomingLastEventId, 10);
      }

      const abortController = new AbortController();
      
      const heartbeatInterval = setInterval(() => {
        if (!abortController.signal.aborted) {
          res.write(': keep-alive heartbeat\n\n');
          if (res.flush) res.flush();
        }
      }, 15000);

      // Clean stream closure loop tracking
      if (res.req) {
        res.req.on('close', () => {
          abortController.abort();
        });
      }

      const runInput: AgentRunInput = {
        runId: input.runId,
        agentId: input.agentId,
        input: {
          query: input.query,
          source: input.source,
        },
      };

      const runtimeContext = {
        logger: context.logger,
        toolRegistry: this.toolRegistry!,
        model: {} as any,
        identity: context.actorIdentity,
        signal: abortController.signal,
        sessionStore: this.sessionStore || undefined,
        checkpointStore: this.checkpointStore || undefined,
        runStore: this.runStore!,
        artifactSink: this.artifactSink || undefined,
        auditLogSink: this.auditLogSink || undefined,
        hardening: this.hardening,
      };

      context.logger.info(`Established live Server-Sent Events tracking pipeline channel context`, {
        runId: input.runId,
        agentId: input.agentId,
        userRef: context.actorIdentity,
        resumedFromSequence: sequenceCounter,
      });

      try {
        if (this.agentRuntime.run) {
          const eventStream = this.agentRuntime.run(runInput, runtimeContext);

          for await (const event of eventStream) {
            if (abortController.signal.aborted) {
              break;
            }

            sequenceCounter += 1;
            const isBufferFree = writeEvent(event.type, event.data, sequenceCounter);
            if (res.flush) res.flush();

            if (!isBufferFree) {
              await new Promise<void>((resolve) => {
                res.once('drain', resolve);
              });
            }
          }
        }
      } catch (error: unknown) {
        if (!abortController.signal.aborted) {
          context.logger.error(`Stream execution failed or was severed prematurely on tracking node`, {
            runId: input.runId,
            agentId: input.agentId,
            userRef: context.actorIdentity,
            errorMessage: error instanceof Error ? error.message : String(error),
          });
          writeEvent('error', { message: 'Internal streaming execution failed or was forcefully terminated' });
        }
      } // Removed empty finally to address explicit clean loop tracking bounds safely
      
      clearInterval(heartbeatInterval);
      context.logger.info(`Terminating event stream response channel bounds`, {
        runId: input.runId,
        userRef: context.actorIdentity,
        abortedByClient: abortController.signal.aborted,
      });
      res.end();
    };
  }
}
