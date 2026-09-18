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
import {
  InputError,
  NotAllowedError,
  NotImplementedError,
} from '@backstage/errors';
import type { PermissionsService } from '@backstage/backend-plugin-api';
import {
  aiPermissions,
  type AugmentationIndexer,
  type EntityFilterShape,
  type EmbeddingsSource
} from '@ai-crew-suite/plugin-kernel-node';
import type { ResourcePermission } from '@backstage/plugin-permission-common';
import type {
  BaseCommandOptions,
  CommandContext,
  PackedRequestInput,
} from './types';
import { CreateEmbeddingsSchema } from '../schemas';
import { BaseKernelCommand } from './BaseKernelCommand';

type CreateEmbeddingsValidatedInput = {
  readonly query: string;
  readonly safeSource: EmbeddingsSource;
  readonly entityFilter?: EntityFilterShape;
};

export interface CreateEmbeddingsCommandOptions extends BaseCommandOptions {
  permissions: PermissionsService;
  augmentationIndexer?: AugmentationIndexer;
}

/**
 * Concrete CQRS Command executing vector knowledge catalog embedding additions.
 * Closes the legacy controller's authorization gap via strict RBAC resource checks.
 */
export class CreateEmbeddingsCommand extends BaseKernelCommand<
  CreateEmbeddingsValidatedInput,
  { readonly response: string; readonly count: number }
> {
  private readonly permissions: PermissionsService;
  private readonly augmentationIndexer?: AugmentationIndexer;

  public constructor(options: CreateEmbeddingsCommandOptions) {
    super(options);

    this.permissions = options.permissions;
    this.augmentationIndexer = options.augmentationIndexer;
  }

  protected verifyInfrastructureDependencies(): void {
    if (!this.augmentationIndexer) {
      throw new NotImplementedError(
        'Augmentation indexing storage component is not configured or mounted on this AI backend kernel node.'
      );
    }
  }

  private validateSource(source: string | undefined): EmbeddingsSource {
    if (!source || source.trim() === '' || source === 'all') {
      return 'all';
    }
    return source;
  }

  protected validate(
    input: PackedRequestInput,
    context: CommandContext
  ): CreateEmbeddingsValidatedInput {
    const result = CreateEmbeddingsSchema.safeParse(input.body);

    if (!result.success) {
      const compiledIssues: string[] = [];

      for (const issue of result.error.issues) {
        if (issue?.message) {
          compiledIssues.push(issue.message);
        }
      }

      const errorMsg = compiledIssues.length > 0
        ? compiledIssues.join(', ')
        : 'Unknown structural schema validation parameter mismatch.';

      context.logger.warn(
        'Schema Validation Rejection: Invalid data payload provided for embedding creation',
        {
          userRef: context.actorIdentity,
        }
      );

      throw new InputError(`Invalid embedding configuration criteria: ${errorMsg}`);
    }

    const { query, source, entityFilter } = result.data;

    const sanitizedQuery = query ? query.trim() : '';

    if (sanitizedQuery === '') {
      context.logger.warn(
        'Schema Validation Rejection: Query cannot be empty or consist only of whitespace characters',
        {
          userRef: context.actorIdentity,
        }
      );

      throw new InputError(
        'Invalid embedding configuration criteria: Query parameter cannot be empty or consist only of whitespace.'
      );
    }

    const safeSource = this.validateSource(source);

    return {
      query: sanitizedQuery,
      safeSource,
      entityFilter: entityFilter as EntityFilterShape,
    };
  }

  protected async authorize(
    input: CreateEmbeddingsValidatedInput,
    context: CommandContext
  ): Promise<void> {
    const targetPermission = aiPermissions.embeddingsWrite as ResourcePermission<string>;

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
        `RBAC violation intercepted: UserRef [${context.actorIdentity}] denied access to permission [${aiPermissions.embeddingsWrite.name}]`);

      throw new NotAllowedError(`Access Denied: Actor lacks required scope: ${aiPermissions.embeddingsWrite.name}`);
    }
  }

  protected async handle(
    input: CreateEmbeddingsValidatedInput,
    context: CommandContext
  ): Promise<{ readonly response: string; readonly count: number }> {
    const indexer = this.augmentationIndexer!;

    context.logger.info('Executing catalog knowledge vector indexing injection loop', {
      safeSource: input.safeSource,
      userRef: context.actorIdentity,
      queryLength: input.query.length,
      hasEntityFilter: Boolean(input.entityFilter),
    });

    let writtenCount = 0;

    try {
      writtenCount = await indexer.createEmbeddings(input.safeSource, input.entityFilter);
    } catch (error: unknown) {
      context.logger.error(
        'Data Layer Write Failure: Augmentation Indexer failed to synchronize vector rows',
        {
          safeSource: input.safeSource,
          userRef: context.actorIdentity,
          queryLength: input.query.length,
          errorMessage: error instanceof Error ? error.message : String(error),
        }
      );

      throw error;
    }

    context.logger.info(
      'Successfully synchronized catalog vector data boundaries',
      {
        safeSource: input.safeSource,
        userRef: context.actorIdentity,
        querySnippet: input.query.substring(0, 30),
        writtenCount,
      }
    );

    return {
      response: `Embeddings created for source ${input.safeSource}`,
      count: writtenCount,
    };
  }
}
