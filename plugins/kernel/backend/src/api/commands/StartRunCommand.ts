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
import { InputError, NotAllowedError, ConflictError, NotImplementedError } from '@backstage/errors';
import { PermissionsService, BackstageCredentials } from '@backstage/backend-plugin-api';
import { ResourcePermission } from '@backstage/plugin-permission-common';
import { RunStore, HardeningOptions, RunRecord } from '@ai-crew-suite/plugin-kernel-node';
import { randomUUID } from 'crypto';
import { BaseKernelCommand } from './BaseKernelCommand';
import { CommandContext, PackedRequestInput } from './types';
import { aiPermissions } from '../permissions';
import { StartRunBodySchema, StartRunParamsSchema } from '../controller/schemas';

type StartRunValidatedInput = {
  readonly agentId: string;
  readonly query: string;
};

interface StartRunRequestBody {
  readonly input?: unknown;
  readonly query?: unknown;
}

export class StartRunCommand extends BaseKernelCommand<
StartRunValidatedInput,
{ readonly runId: string; readonly status: string }
> {
  private readonly credentials: BackstageCredentials;

  public constructor(
    private readonly permissions: PermissionsService,
    private readonly agentsMap: Map<string, unknown>,
    private readonly consumeRateLimit: (agentId: string) => boolean,
    private readonly runStore?: RunStore,
    private readonly hardening?: HardeningOptions,
    credentials?: BackstageCredentials
  ) {
    super();

    if (!credentials) {
      throw new NotAllowedError(
        'Perimeter Authentication Failure: Request contains empty or unverified token principals.'
      );
    }

    this.credentials = credentials;
  }

  protected verifyInfrastructureDependencies(): void {
    // Enforce rigid boot-readiness invariants for storage adapters
    if (!this.runStore) {
      throw new NotImplementedError(
        'Run persistence storage engine is not configured or mounted on this AI backend kernel node.'
      );
    }

    // Enforce presence of our active security resilience throttling mechanism
    if (!this.consumeRateLimit) {
      throw new NotImplementedError(
        'Throttling and rate-limiting infrastructure boundaries are missing from this execution engine context.'
      );
    }
  }

  protected validate(input: PackedRequestInput, context: CommandContext): StartRunValidatedInput {
    const headersMap = input.headers as Record<string, string | string[] | undefined>;
    const authorizationHeader = headersMap['authorization'];

    const hasAuthHeader = Boolean(authorizationHeader);
    const hasCsrfGateHeader = Boolean(headersMap['x-requested-with'] || headersMap['backstage-ajax-token']);

    if (!hasAuthHeader && !hasCsrfGateHeader) {
      context.logger.warn(
        'Security Perimeter Blocked: Mutative run request dropped due to missing custom cross-origin verification tokens',
        {
          userRef: context.actorIdentity,
        }
      );

      throw new NotAllowedError(
        'Missing cross-site request validation headers required for cookie authorization paths.'
      );
    }

    const typedBody = input.body as StartRunRequestBody;
    const parsedBodyTarget = typedBody.input !== undefined ? typedBody.input : typedBody;

    const paramsResult = StartRunParamsSchema.safeParse(input.params);
    const bodyResult = StartRunBodySchema.safeParse(parsedBodyTarget);

    if (!paramsResult.success || !bodyResult.success) {
      const compiledIssues: string[] = [];

      if (!paramsResult.success && paramsResult.error?.issues) {
        for (const issue of paramsResult.error.issues) {
          if (issue?.message) {
            compiledIssues.push(issue.message);
          }
        }
      }

      if (!bodyResult.success && bodyResult.error?.issues) {
        for (const issue of bodyResult.error.issues) {
          if (issue?.message) {
            compiledIssues.push(issue.message);
          }
        }
      }

      const errorMsg = compiledIssues.length > 0
        ? compiledIssues.join(', ') 
        : 'Unknown structural schema validation parameter mismatch.';

      context.logger.warn(
        'Run Initialization Dropped: Payload bounds mismatched schema contracts',
        {
          userRef: context.actorIdentity,
        }
      );

      throw new InputError(`Invalid run initialization criteria: ${errorMsg}`);
    }

    const { id: agentId } = paramsResult.data;

    if (!this.agentsMap.has(agentId)) {
      context.logger.error(
        'Run Initialization Rejected: Requested agent target mapping does not exist', {
          agentId,
          userRef: context.actorIdentity,
        }
      );
      throw new InputError(`Unknown agent identifier target provided: '${agentId}'`);
    }

    const structuralBody = parsedBodyTarget as StartRunRequestBody;
    const rawQuery = structuralBody.query !== undefined ? String(structuralBody.query).trim() : '';

    return {
      agentId,
      query: rawQuery,
    };
  }

  protected async authorize(input: StartRunValidatedInput, context: CommandContext): Promise<void> {
    const targetPermission = aiPermissions.agentRun as ResourcePermission<string>;
    const decisions = await this.permissions.authorize(
      [{ permission: targetPermission, resourceRef: input.agentId }],
      { credentials: this.credentials }
    );

    const [mainDecision] = decisions;

    // Parity Check: Reject if array payload is completely empty
    if (!mainDecision) {
      context.logger.error('RBAC critical evaluation failure: Authorization response payload was completely empty');

      throw new Error('Internal authorization parsing failure encountered');
    }

    if (mainDecision.result === 'DENY') {
      context.logger.warn(
        `RBAC violation intercepted: UserRef [${context.actorIdentity}] denied access to permission [${aiPermissions.agentRun.name}]`
      );

      throw new NotAllowedError(`Access Denied: Actor lacks required scope: ${aiPermissions.agentRun.name}`);
    }

    if (!this.consumeRateLimit(input.agentId)) {
      throw new ConflictError('Rate limit exceeded for agent. Core capacity thresholds exhausted.');
    }
  }


  protected async handle(input: StartRunValidatedInput, context: CommandContext): Promise<{ readonly runId: string; readonly status: string }> {
    const runId = randomUUID();

    context.logger.info(
      'Initializing agent thread lifecycle yielding tracking target identifier',
      {
        runId,
        agentId: input.agentId,
        userRef: context.actorIdentity,
        queryLength: input.query.length,
        executionMode: 'user_orchestrated_run',
      }
    );

    if (this.runStore?.createRun) {
      const hardeningTimeout = this.hardening?.timeoutMs;

      const dbTimeoutMs = (hardeningTimeout && hardeningTimeout > 0) ? hardeningTimeout : 10000;

      const dbTimeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(
          new Error('Core storage ledger allocation operation exceeded system time limits')),
          dbTimeoutMs,
        )
      );

      try {
        const runRecord: RunRecord = {
          id: runId,
          agentId: input.agentId,
          status: 'initialized',
          actorIdentity: context.actorIdentity,
          createdAt: new Date().toISOString(),
        };

        await Promise.race([
          this.runStore.createRun(runRecord),
          dbTimeoutPromise,
        ]);

      } catch (storeError: unknown) {
        context.logger.error(
          'Critical Persistence Ledger Allocation Failure: Failed to write run tracking node',
            {
            runId,
            agentId: input.agentId,
            userRef: context.actorIdentity,
            errorMessage: storeError instanceof Error ? storeError.message : String(storeError),
          }
        );

        throw new Error('An infrastructure exception blocked workflow thread execution provisioning channels.');
      }
    }

    return {
      runId,
      status: 'accepted',
    };
  }
}
