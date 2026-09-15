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
import {
  ConflictError,
  NotAllowedError,
  NotFoundError,
  NotImplementedError,
} from '@backstage/errors';
import {
  BackstageCredentials,
  PermissionsService,
} from '@backstage/backend-plugin-api';
import { ResourcePermission } from '@backstage/plugin-permission-common';
import {
  aiPermissions,
  ApprovalDecision,
  ArtifactSink,
  AuditLogSink,
  CheckpointStore,
  RunRecord,
  RunStore,
  SessionStore,
  ToolRegistry,
} from '@ai-crew-suite/plugin-kernel-node';
import { BaseKernelCommand } from './BaseKernelCommand';
import {
  CommandContext,
  PackedRequestInput,
} from './types';
import {
  ApproveRunBodySchema,
  ApproveRunParamsSchema,
} from '../controller/schemas';
import { AgentRuntime } from '../../runtime/AgentRuntime';

type ApproveRunValidatedInput = {
  readonly runId: string;
  readonly status: 'approved' | 'rejected';
  readonly note?: string;
};

/**
 * Concrete CQRS Command handling workflow supervisor approvals.
 */
export class ApproveRunCommand extends BaseKernelCommand<
  ApproveRunValidatedInput,
  { success: boolean; status: string }
> {
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
    private readonly hardening?: Record<string, unknown>,
    credentials?: BackstageCredentials
  ) {
    super();

    if (!credentials) {
      throw new NotImplementedError(
        'Perimeter Authentication Failure: Request contains empty or unverified token principals.'
      );
    }

    this.credentials = credentials;
  }

  protected async authorize(input: ApproveRunValidatedInput, context: CommandContext): Promise<void> {
    const targetPermission = aiPermissions.agentApprove as ResourcePermission<string>;

    const decisions = await this.permissions.authorize(
      [{ permission: targetPermission, resourceRef: input.runId }],
      { credentials: this.credentials }
    );

    const [mainDecision] = decisions;

    // Parity Check: Reject if array payload is completely empty
    if (!mainDecision) {
      context.logger.error('RBAC approval evaluation failure: Authorization response payload was completely empty');
      throw new Error('Internal authorization parsing failure encountered');
    }

    if (mainDecision.result === 'DENY') {
      context.logger.warn(`RBAC Approval Blocked: UserRef [${context.actorIdentity}] lacks clearance to authorize execution runs`);
      throw new NotAllowedError(`Access Denied: Actor lacks required scope: ${aiPermissions.agentApprove.name}`);
    }
  }

  protected validate(input: PackedRequestInput, _context: CommandContext): ApproveRunValidatedInput {
    const { paramsData, bodyData } = this.parseCombinedSchemas(
      ApproveRunParamsSchema,
      ApproveRunBodySchema,
      input
    );

    return {
      runId: paramsData.id,
      status: bodyData.status,
      note: bodyData.note ? bodyData.note.trim() : undefined,
    };
  }

  protected verifyInfrastructureDependencies(): void {
    if (!this.runStore) {
      throw new NotImplementedError(
        'Run persistence store is not configured on this AI backend kernel node.'
      );
    }
  }

  protected async handle(
    input: ApproveRunValidatedInput,
    context: CommandContext
  ): Promise<{ success: boolean; status: string }> {
    const runStore = this.runStore!;
    let activeRun: RunRecord | undefined;

    try {
      activeRun = await runStore.getRun(input.runId);
    } catch (storeError: unknown) {
      context.logger.error(
        'Core Storage Failure: Verification check crashed during approval lookup boundaries',
        {
          runId: input.runId,
          userRef: context.actorIdentity,
          internalError: storeError instanceof Error ? storeError.message : String(storeError),
        }
      );

      throw new Error('An infrastructure exception blocked automated manual checkpoint verification.');
    }

    if (!activeRun) {
      throw new NotFoundError(
        `The targeted run instance '${input.runId}' could not be resolved inside persistence records.`
      );
    }

    if (activeRun.status === 'done' || activeRun.status === 'running') {
      context.logger.warn(
        'Approval Request Rejected: Cannot mutate a run that is already in a final or active state',
        {
          runId: input.runId,
          currentStatus: activeRun.status,
          userRef: context.actorIdentity,
        }
      );

      throw new ConflictError(
        `The workflow run '${input.runId}' cannot be modified because its current status is already '${activeRun.status}'.`
      );
    }

    if (activeRun.actorIdentity === context.actorIdentity) {
      context.logger.warn(
        'Governance Breach Prevented: Initiating operator blocked from self-approving checkpoint step',
        {
          runId: input.runId,
          violatorRef: context.actorIdentity,
        }
      );

      throw new NotAllowedError(
        'Compliance Rejection: Segregation of duties prevents the run creator from self-approving manual checkpoints.'
      );
    }

    const decision: ApprovalDecision = {
      status: input.status,
      note: input.note,
      decidedBy: context.actorIdentity,
    };

    context.logger.warn(
      'Recording human authorization decision update against pipeline execution bounds',
      {
        runId: input.runId,
        decisionStatus: input.status,
        reviewerRef: context.actorIdentity,
      }
    );

    await runStore.decideApproval(input.runId, decision);

    await new Promise<void>(resolve => {
      setImmediate(resolve);
    });

    if (this.agentRuntime.resume) {
      try {
        const runtimeContext = {
          logger: context.logger,
          toolRegistry: this.toolRegistry!,
          model: {} as any,
          identity: context.actorIdentity,
          sessionStore: this.sessionStore || undefined,
          checkpointStore: this.checkpointStore || undefined,
          runStore,
          artifactSink: this.artifactSink || undefined,
          auditLogSink: this.auditLogSink || undefined,
          hardening: this.hardening,
        };

        const resumeStream = this.agentRuntime.resume(input.runId, decision, runtimeContext);

        for await (const event of resumeStream) {
          context.logger.debug(
            'Resume state step transition processed for execution node',
            {
              runId: input.runId,
              eventType: event.type,
            }
          );
        }
      } catch (resumeError: unknown) {
        context.logger.error(
          'Fatal background loop system processing crack encountered during state resumption',
          {
            runId: input.runId,
            userRef: context.actorIdentity,
            errorMessage: resumeError instanceof Error ? resumeError.message : String(resumeError),
          }
        );

        throw new Error('Failed to cleanly wake up graph sequence loop after checkpoint approval processing.');
      }
    }

    return {
      success: true,
      status: `Run loop unblocked as: ${input.status}`,
    };
  }
}
