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
import {
  BackstageCredentials,
  PermissionsService,
} from '@backstage/backend-plugin-api';
import { ResourcePermission } from '@backstage/plugin-permission-common';
import {
  AgentRunInput,
  aiPermissions,
  HardeningOptions,
  TriggerBinding,
  WebhookRuntimeEngine,
} from '@ai-crew-suite/plugin-kernel-node';
import { BaseKernelCommand } from './BaseKernelCommand';
import {
  CommandContext,
  PackedRequestInput
} from './types';
import {
  GenericEventPayloadSchema,
  WebhookRunParamsSchema,
} from '../schemas';

type WebhookRunValidatedInput = {
  readonly safeProviderName: string;
  readonly safeTriggerId: string;
  readonly query: string;
  readonly payloadSizeBytes: number;
  readonly matchedBinding: TriggerBinding;
};

/**
 * Concrete CQRS Command processing third-party external webhook ingestion event signals.
 * Insulates background tasks via asynchronous fire-and-forget logging boundaries.
 */
export class WebhookRunCommand extends BaseKernelCommand<WebhookRunValidatedInput, { readonly runId: string; readonly status: string }> {

  public constructor(
    private readonly permissions: PermissionsService,
    private readonly agentRuntime?: WebhookRuntimeEngine,
    private readonly triggersList?: TriggerBinding[],
    private readonly agentsMap?: Map<string, unknown>,
    private readonly hardeningOptions?: HardeningOptions,
    credentials?: BackstageCredentials
  ) {
    super(credentials);
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

  protected validate(input: PackedRequestInput, context: CommandContext): WebhookRunValidatedInput {
    // 1. Dual Schema Guard Validation Pass
    const paramsResult = WebhookRunParamsSchema.safeParse(input.params);
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

      const errorMsg = compiledIssues.length > 0 ? compiledIssues.join(', ') : 'Unknown webhook configuration mismatch.';
      context.logger.warn('Webhook Validation Drop: External payload mapping parameter mismatch', {
        userRef: context.actorIdentity,
      });
      throw new InputError(`Invalid webhook invocation criteria constraints: ${errorMsg}`);
    }

    const { provider } = paramsResult.data;
    const { triggerId, query } = bodyResult.data;
    const sanitizedQuery = query ? query.trim() : '';

    if (sanitizedQuery === '') {
      context.logger.warn('Webhook Validation Drop: Query parameter cannot be empty or consist only of whitespace characters', {
        userRef: context.actorIdentity,
      });
      throw new InputError('Invalid webhook invocation criteria constraints: Query parameter cannot be empty or consist only of whitespace.');
    }

    // 2. Security Hardening Input Sanitization against log-injection attempts
    const safeProviderName = provider.replace(/[^a-zA-Z0-9_-]/g, '');
    const safeTriggerId = triggerId.replace(/[^a-zA-Z0-9_-]/g, '');

    // 3. Active Governance Binding Resolution Layer
    const matchedBinding = this.triggersList!.find(t => t.id === safeTriggerId && t.source === safeProviderName);
    if (!matchedBinding) {
      context.logger.warn('Webhook invocation ignored: Provider mapping target has no matching configuration rules', {
        triggerId: safeTriggerId,
        provider: safeProviderName,
        userRef: context.actorIdentity,
      });
      throw new InputError(`Webhook destination rule mapping is unconfigured for provider=${safeProviderName}, triggerId=${safeTriggerId}`);
    }

    const agentId = matchedBinding.agentId;
    if (!this.agentsMap!.has(agentId)) {
      throw new InputError(`Configured webhook target agent mapping '${agentId}' does not exist inside active engine configurations.`);
    }

    // Calculate Ingress Sizes safely from packed literal parameters dictionaries
    const headersMap = input.headers as Record<string, string | string[] | undefined>;
    const contentLength = headersMap['content-length'];
    const payloadSizeBytes = typeof contentLength === 'string' && !Number.isNaN(Number(contentLength))
      ? Number(contentLength)
      : JSON.stringify(input.body).length;

    return {
      safeProviderName,
      safeTriggerId,
      query: sanitizedQuery,
      payloadSizeBytes,
      matchedBinding,
    };
  }

  protected async authorize(input: WebhookRunValidatedInput, context: CommandContext): Promise<void> {
    const targetPermission = aiPermissions.infrastructureTrigger as ResourcePermission<string>;
    const decisions = await this.permissions.authorize(
      [{ permission: targetPermission, resourceRef: input.safeProviderName }],
      { credentials: this.credentials }
    );

    const [mainDecision] = decisions;

    if (!mainDecision) {
      context.logger.error('RBAC critical evaluation failure: Authorization response payload was completely empty');
      throw new Error('Internal authorization parsing failure encountered');
    }

    if (mainDecision.result === 'DENY') {
      context.logger.warn(`Infrastructure Webhook Violation: External entity [${context.actorIdentity}] rejected`);
      throw new NotAllowedError('Forbidden: Webhook signature lacks authorization');
    }
  }

  protected async handle(input: WebhookRunValidatedInput, context: CommandContext): Promise<{ readonly runId: string; readonly status: string }> {
    const runId = randomUUID();
    const agentId = input.matchedBinding.agentId;

    context.logger.info('Authorized external webhook alert originating from provider boundary', {
      runId,
      triggerId: input.safeTriggerId,
      provider: input.safeProviderName,
      agentId,
      userRef: context.actorIdentity,
      executionType: 'external_infrastructure_webhook',
      payloadSizeBytes: input.payloadSizeBytes,
    });

    const runInput: AgentRunInput = {
      runId,
      agentId,
      trigger: `webhook-${input.safeProviderName}`,
      input: {
        query: input.query,
        source: 'all',
      },
    };

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

    // 4. Isolated Background Non-Blocking Thread Execution Loop Enclosure
    (async () => {
      const eventStream = this.agentRuntime!.run(runInput, runtimeContext);
      
      for await (const event of eventStream) {
        if (event && typeof event === 'object' && 'type' in event) {
          if (event.type === 'done') {
            context.logger.info('Webhook orchestrated agent run thread successfully completed task actions', {
              runId,
              triggerId: input.safeTriggerId,
              provider: input.safeProviderName,
              userRef: context.actorIdentity,
            });
          }
          if (event.type === 'error' && event.data) {
            context.logger.error('Webhook background run iteration reported engine failure', {
              runId,
              triggerId: input.safeTriggerId,
              provider: input.safeProviderName,
              userRef: context.actorIdentity,
              errorCode: event.data.code,
              errorMessage: event.data.message,
            });
          }
        }
      }
    })().catch((err: unknown) => {
      const baseError = err ? err : new Error('Opaque un-handled microtask worker thread exception');
      const finalError = baseError instanceof Error ? baseError : new Error(String(baseError));

      context.logger.error('Fatal background loop system processing crack encountered on webhook run tracker', {
        runId,
        triggerId: input.safeTriggerId,
        provider: input.safeProviderName,
        userRef: context.actorIdentity,
        errorName: finalError.name || 'Error',
        errorMessage: finalError.message || String(finalError),
        errorStack: finalError.stack,
      });
    });

    return {
      runId,
      status: 'webhook_processing_dispatched',
    };
  }
}
