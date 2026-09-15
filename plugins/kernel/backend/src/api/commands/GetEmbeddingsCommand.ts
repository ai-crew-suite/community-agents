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
  InputError,
  NotAllowedError,
  NotImplementedError,
} from '@backstage/errors';
import {
  BackstageCredentials,
  PermissionsService,
} from '@backstage/backend-plugin-api';
import { ResourcePermission } from '@backstage/plugin-permission-common';
import { BaseKernelCommand } from './BaseKernelCommand';
import {
  CommandContext,
  PackedRequestInput,
} from './types';
import {
  aiPermissions,
  EmbeddingsSource,
  EntityFilterShape,
  HardeningOptions
} from '@ai-crew-suite/plugin-kernel-node';
import { GetEmbeddingsQuerySchema } from '../schemas';

type GetEmbeddingsValidatedInput = {
  readonly query: string;
  readonly safeSource: EmbeddingsSource;
  readonly entityFilter?: EntityFilterShape;
};

export interface RetrievalPipeline {
  retrieveAugmentationContext(query: string, source: EmbeddingsSource, filter?: EntityFilterShape): Promise<unknown>;
}

export class GetEmbeddingsCommand extends BaseKernelCommand<
  GetEmbeddingsValidatedInput,
  { readonly results: unknown }
> {
  public constructor(
    private readonly permissions: PermissionsService,
    private readonly retrievalPipeline?: RetrievalPipeline,
    private readonly hardening?: HardeningOptions,
    credentials?: BackstageCredentials
  ) {
    super(credentials);
  }

  protected async authorize(input: GetEmbeddingsValidatedInput, context: CommandContext): Promise<void> {
    const targetPermission = aiPermissions.embeddingsRead as ResourcePermission<string>;
    const decisions = await this.permissions.authorize(
      [{ permission: targetPermission, resourceRef: input.safeSource }],
      { credentials: this.credentials }
    );

    const [mainDecision] = decisions;

    if (!mainDecision) {
      context.logger.error('RBAC critical evaluation failure: Authorization response payload was completely empty');

      throw new Error('Internal authorization parsing failure encountered');
    }

    if (mainDecision.result === 'DENY') {
      context.logger.warn(
        `RBAC violation intercepted: UserRef [${context.actorIdentity}] denied access to permission [${aiPermissions.embeddingsRead.name}]`
      );

      throw new NotAllowedError(`Access Denied: Actor lacks required scope: ${aiPermissions.embeddingsRead.name}`);
    }
  }

  protected validate(input: PackedRequestInput, context: CommandContext): GetEmbeddingsValidatedInput {
    const result = GetEmbeddingsQuerySchema.safeParse(input.query);

    if (!result.success) {
      const compiledIssues: string[] = [];

      for (const issue of result.error.issues) {
        if (issue?.message) { compiledIssues.push(issue.message); }
      }

      const errorMsg = compiledIssues.length > 0 ? compiledIssues.join(', ') : 'Unknown structural schema validation parameter mismatch.';

      context.logger.warn(
        'Schema Validation Rejection: Invalid query parameters provided for embedding retrieval',
        {
          userRef: context.actorIdentity,
        }
      );

      throw new InputError(`Invalid embedding query parameters: ${errorMsg}`);
    }

    const { query, source, entityFilter } = result.data;
    const sanitizedQuery = query.trim();

    if (sanitizedQuery === '') {
      context.logger.warn(
        'Schema Validation Rejection: Query cannot be empty or consist only of whitespace characters',
        {
          userRef: context.actorIdentity,
        }
      );

      throw new InputError(
        'Invalid embedding query parameters: Query parameter cannot be empty or consist only of whitespace.'
      );
    }

    const safeSource = this.validateSource(source);

    return {
      query: sanitizedQuery,
      safeSource,
      entityFilter: entityFilter as EntityFilterShape,
    };
  }

  protected verifyInfrastructureDependencies(): void {
    if (!this.retrievalPipeline) {
      throw new NotImplementedError('Retrieval pipeline is not configured on this AI backend kernel node.');
    }
  }

  private validateSource(source: string | undefined): EmbeddingsSource {
    if (!source || source.trim() === '' || source === 'all') {
      return 'all';
    }

    return source;
  }

  protected async handle(input: GetEmbeddingsValidatedInput, context: CommandContext): Promise<{ readonly results: unknown }> {
    const pipeline = this.retrievalPipeline!;

    context.logger.info(
      'Executing semantic context augmentation query retrieval',
      {
        safeSource: input.safeSource,
        userRef: context.actorIdentity,
        queryLength: input.query.length,
        hasEntityFilter: Boolean(input.entityFilter),
      }
    );

    const hardeningTimeout = this.hardening?.timeoutMs;
    const operationTimeoutMs = (hardeningTimeout && hardeningTimeout > 0) ? hardeningTimeout : 30000;

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(
        new Error('Vector data layer retrieval task exceeded maximum configured timeout boundary')),
        operationTimeoutMs
      )
    );

    let results: unknown;

    try {
      results = await Promise.race([
        pipeline.retrieveAugmentationContext(input.query, input.safeSource, input.entityFilter),
        timeoutPromise,
      ]);

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (errorMessage.includes('timeout boundary')) {
        throw error;
      }

      context.logger.error(
        'Data Layer Read Retrieval Failure: Vector pipeline engine failed to resolve query context',
        {
          safeSource: input.safeSource,
          userRef: context.actorIdentity,
          queryLength: input.query.length,
          internalError: errorMessage,
        }
      );

      throw new Error('An internal data layer exception blocked vector retrieval execution profiles.');
    }

    context.logger.info(
      'Successfully compiled knowledge catalog semantic context arrays',
      {
        safeSource: input.safeSource,
        userRef: context.actorIdentity,
        recordsExtracted: Array.isArray(results) ? results.length : 1,
      }
    );

    return { results };
  }
}
