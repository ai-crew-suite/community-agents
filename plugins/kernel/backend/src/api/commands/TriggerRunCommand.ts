/**
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
import {
  InputError,
  NotAllowedError,
  NotImplementedError,
} from '@backstage/errors';
import type { PermissionsService } from '@backstage/backend-plugin-api';
import type { ResourcePermission } from '@backstage/plugin-permission-common';
import {
  aiPermissions,
  type TriggerBinding,
  type HardeningOptions,
  type AgentRunInput,
} from '@ai-crew-suite/plugin-kernel-node';
import type {
  BaseCommandOptions,
  CommandContext,
  PackedRequestInput,
} from './types';
import {
  TriggerRunParamsSchema,
  GenericEventPayloadSchema,
} from '../schemas';
import { BaseKernelCommand } from './BaseKernelCommand';

type TriggerRunValidatedInput = {
  readonly source: string;
  readonly triggerId: string;
  readonly query: string;
  readonly matchedBinding: TriggerBinding;
};

export interface TriggerRunCommandOptions extends BaseCommandOptions {
  agentRuntime?: AgentRuntimeEngine;
  agentsMap?: Map<string, unknown>;
  hardeningOptions?: HardeningOptions;
  permissions: PermissionsService;
  triggersList?: TriggerBinding[];
}

export interface AgentRuntimeEngine {
  run(input: AgentRunInput, context: unknown): any;
}

/**
 * Concrete CQRS Command executing background infrastructure automated run workflows.
 * Enforces strict non-nullable service principal context verification and prevents background thread leaks.
 */
export class TriggerRunCommand extends BaseKernelCommand<
  TriggerRunValidatedInput,
  { readonly runId: string; readonly status: string }
> {
  private readonly permissions: PermissionsService;
  private readonly agentRuntime?: AgentRuntimeEngine;
  private readonly triggersList?: TriggerBinding[];
  private readonly agentsMap?: Map<string, unknown>;
  private readonly hardeningOptions?: HardeningOptions;

  public constructor(options: TriggerRunCommandOptions) {
    super(options);

    this.permissions = options.permissions;
    this.agentRuntime = options.agentRuntime;
    this.triggersList = options.triggersList;
    this.agentsMap = options.agentsMap;
    this.hardeningOptions = options.hardeningOptions;
  }

  protected verifyInfrastructureDependencies(): void {
    if (!this.agentRuntime) {
      throw new NotImplementedError('Agent core runtime engine sub-system is not configured or mounted on this AI node.');
    }

    if (!this.triggersList) {
      throw new NotImplementedError('Infrastructure automation trigger binding configurations registry array is unconfigured.');
    }

    if (!this.agentsMap) {
      throw new NotImplementedError('Internal agent profile configuration registry mapping dictionary is unconfigured.');
    }
  }

  protected validate(input: PackedRequestInput, context: CommandContext): TriggerRunValidatedInput {
    // Dual Schema Guard Validation Pass via clean error aggregation lines
    const paramsResult = TriggerRunParamsSchema.safeParse(input.params);
    const bodyResult = GenericEventPayloadSchema.safeParse(input.body);

    if (!paramsResult.success || !bodyResult.success) {
      const compiledIssues: string[] = [];

      if (!paramsResult.success && paramsResult.error?.issues) {
        for (const issue of paramsResult.error.issues) {
          if (issue?.message) { compiledIssues.push(issue.message); }
        }
      }

      if (!bodyResult.success && bodyResult.error?.issues) {
        for (const issue of bodyResult.error.issues) {
          if (issue?.message) { compiledIssues.push(issue.message); }
        }
      }

      const errorMsg = compiledIssues.length > 0 ? compiledIssues.join(', ') : 'Unknown trigger configuration mismatch.';

      context.logger.warn(
        'Infrastructure Validation Drop: Automated trigger mapping parameters mismatched schema contracts',
        {
          userRef: context.actorIdentity,
        }
      );

      throw new InputError(`Invalid trigger event criteria constraints: ${errorMsg}`);
    }

    const { source } = paramsResult.data;
    const { triggerId, query } = bodyResult.data;
    const sanitizedQuery = query ? query.trim() : '';

    if (sanitizedQuery === '') {
      context.logger.warn(
        'Infrastructure Validation Drop: Query string cannot be empty or consist only of whitespace characters',
        {
          userRef: context.actorIdentity,
        }
      );

      throw new InputError(
        'Invalid trigger event criteria constraints: Query parameter cannot be empty or consist only of whitespace.'
      );
    }

    // Active Governance Binding Resolution Layer
    const matchedBinding = this.triggersList!.find(t => t.id === triggerId && t.source === source);

    if (!matchedBinding) {
      context.logger.warn(
        'Background event rejected: No active trigger binding maps to requested orchestration context',
        {
          triggerId,
          source,
          userRef: context.actorIdentity,
        }
      );

      throw new InputError(
        `Trigger binding mapping unresolved for parameters: source=${source}, triggerId=${triggerId}`
      );
    }

    const agentId = matchedBinding.agentId;

    if (!this.agentsMap!.has(agentId)) {
      throw new InputError(`Configured agent mapping '${agentId}' does not exist inside active engine configurations.`);
    }

    return {
      source,
      triggerId,
      query: sanitizedQuery,
      matchedBinding,
    };
  }

  protected async authorize(input: TriggerRunValidatedInput, context: CommandContext): Promise<void> {
    // Enforce strict automated system principal authorization checks
    const targetPermission = aiPermissions.infrastructureTrigger as ResourcePermission<string>;

    const decisions = await this.permissions.authorize(
      [{ permission: targetPermission, resourceRef: input.source }],
      { credentials: this.credentials }
    );

    const [mainDecision] = decisions;

    if (!mainDecision) {
      context.logger.error(
        'RBAC critical evaluation failure: Authorization response payload was completely empty'
      );

      throw new Error('Internal authorization parsing failure encountered');
    }

    if (mainDecision.result === 'DENY') {
      context.logger.warn(
        `Infrastructure Security Violation: Automation identity [${context.actorIdentity}] rejected`
      );

      throw new NotAllowedError('Forbidden: Infrastructure principal context denied trigger privileges');
    }
  }

  protected async handle(
    input: TriggerRunValidatedInput,
    context: CommandContext
  ): Promise<{ readonly runId: string; readonly status: string }> {
    const runId = randomUUID();
    const agentId = input.matchedBinding.agentId;

    context.logger.info(
      'Dispatched automated infrastructure run thread via background trigger gateway',
      {
        runId,
        triggerId: input.triggerId,
        source: input.source,
        agentId,
        userRef: context.actorIdentity,
        executionType: 'automated_background_cron',
      }
    );

    const runInput: AgentRunInput = {
      runId,
      agentId,
      trigger: input.triggerId,
      input: {
        query: input.query,
        source: 'all',
      },
    };

    // Inject hard constraints to completely protect against runaway loop billing costs
    const baseHardening = this.hardeningOptions ?? {};

    const runtimeContext = {
      logger: context.logger,
      identity: context.actorIdentity,
      hardening: {
        timeoutMs: baseHardening.timeoutMs || 120000, 
        maxRetries: baseHardening.maxRetries || 3,
        retryBackoffMs: baseHardening.retryBackoffMs || 1000,
        maxTotalTokens: baseHardening.maxTotalTokens || 50000,
      },
    };

    // Hardened Asynchronous Non-Blocking Background Loop Enclosure. Explicitly captures streaming
    // exceptions outside the main HTTP thread execution stack to protect process health
    (async () => {
      const eventStream = this.agentRuntime!.run(runInput, runtimeContext);

      for await (const event of eventStream) {
        if (event && typeof event === 'object' && 'type' in event && event.type === 'error' && event.data) {
          context.logger.error(
            'Automated background run iteration reported engine failure',
            {
              runId,
              triggerId: input.triggerId,
              agentId,
              userRef: context.actorIdentity,
              errorCode: event.data.code,
              errorMessage: event.data.message,
              retryable: event.data.retryable,
            }
          );
        }
      }
    })().catch((err: unknown) => {
      const exception = err instanceof Error ? err : new Error(String(err));
      context.logger.error(
        'Fatal background loop system processing crack encountered on automated run tracker',
        {
          runId,
          triggerId: input.triggerId,
          agentId,
          userRef: context.actorIdentity,
          errorName: exception.name || 'UnknownError',
          errorMessage: exception.message || String(err),
          errorStack: exception.stack,
        }
      );
    });

    return {
      runId,
      status: 'trigger_processing_dispatched',
    };
  }
}
