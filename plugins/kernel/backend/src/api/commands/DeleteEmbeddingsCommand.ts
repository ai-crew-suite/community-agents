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
  ConflictError,
} from '@backstage/errors';
import type { PermissionsService } from '@backstage/backend-plugin-api';
import type { ResourcePermission } from '@backstage/plugin-permission-common';
import {
  aiPermissions,
  AugmentationIndexer,
  EntityFilterShape,
  EmbeddingsSource,
  HardeningOptions
} from '@ai-crew-suite/plugin-kernel-node';
import {
  BaseCommandOptions,
  CommandContext,
  PackedRequestInput,
} from './types';
import { DeleteEmbeddingsSchema } from '../schemas';
import { BaseKernelCommand } from './BaseKernelCommand';

type DeleteEmbeddingsValidatedInput = {
  readonly safeSource: EmbeddingsSource;
  readonly entityFilter?: EntityFilterShape;
};

export interface DeleteEmbeddingsCommandOptions extends BaseCommandOptions {
  permissions: PermissionsService;
  augmentationIndexer?: AugmentationIndexer;
  hardening?: HardeningOptions;
}

/**
 * Concrete CQRS Command executing vector knowledge catalog embedding purges.
 * Closes the legacy controller's authorization gap via strict RBAC resource checks.
 */
export class DeleteEmbeddingsCommand extends BaseKernelCommand<
  DeleteEmbeddingsValidatedInput,
  { readonly response: string }
> {
  private readonly permissions: PermissionsService;
  private readonly augmentationIndexer?: AugmentationIndexer;
  private readonly hardening?: HardeningOptions;

  public constructor(options: DeleteEmbeddingsCommandOptions) {
    super(options);

    this.permissions = options.permissions;
    this.augmentationIndexer = options.augmentationIndexer;
    this.hardening = options.hardening;
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
  ): DeleteEmbeddingsValidatedInput {
    // Structural Schema Guard Validation Pass
    const result = DeleteEmbeddingsSchema.safeParse(input.body);

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
        'Schema Validation Rejection: Invalid data payload provided for embedding deletion',
        {
          userRef: context.actorIdentity,
        }
      );

      throw new InputError(`Invalid embedding deletion criteria: ${errorMsg}`);
    }

    const { source, entityFilter } = result.data;

    const safeSource = this.validateSource(source);

    return {
      safeSource,
      entityFilter: entityFilter as EntityFilterShape,
    };
  }

  protected async authorize(
    input: DeleteEmbeddingsValidatedInput,
    context: CommandContext
  ): Promise<void> {
    // Perimeter Protection: Enforce explicit deletion RBAC scope
    const targetPermission = aiPermissions.embeddingsDelete as ResourcePermission<string>;

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
        `RBAC violation intercepted: UserRef [${context.actorIdentity}] denied access to permission [${aiPermissions.embeddingsDelete.name}]`
      );

      throw new NotAllowedError(`Access Denied: Actor lacks required scope: ${aiPermissions.embeddingsDelete.name}`);
    }
  }

  protected async handle(
    input: DeleteEmbeddingsValidatedInput,
    context: CommandContext
  ): Promise<{ readonly response: string }> {
    const indexer = this.augmentationIndexer!;

    context.logger.warn(
      'Initiating catalog data destruction routine',
      {
        safeSource: input.safeSource,
        userRef: context.actorIdentity,
        hasEntityFilter: Boolean(input.entityFilter),
      }
    );

    // Durable Persistence Serialization via Timeout Fences
    const hardeningTimeout = this.hardening?.timeoutMs;
    const operationTimeoutMs = (hardeningTimeout && hardeningTimeout > 0) ? hardeningTimeout : 30000;

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(
          new Error('Vector data layer deletion task exceeded maximum configured timeout boundary')
        ),
        operationTimeoutMs
      )
    );

    try {
      await Promise.race([
        indexer.deleteEmbeddings(input.safeSource, input.entityFilter),
        timeoutPromise,
      ]);

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Enforce lowercase normalization to match uppercase/mixed string variations cleanly
      const normalizedError = errorMessage.toLowerCase();

      // Map transactional locking or cluster update blocks to ConflictError
      if (
        normalizedError.includes('lock') || 
        normalizedError.includes('deadlock') || 
        normalizedError.includes('concurrent')
      ) {
        context.logger.warn(
          'Database Mutative Race Condition Caught: Deletion blocked by a concurrent table lock',
          {
            safeSource: input.safeSource,
            userRef: context.actorIdentity,
            errorMessage,
          }
        );

        throw new ConflictError(
          `The embedding resource '${input.safeSource}' is currently undergoing a structural update cycle. Please retry shortly.`
        );
      }

      context.logger.error(
        'Data Layer Mutative Erasure Failure: Augmentation Indexer failed to purge vector entries',
        {
          safeSource: input.safeSource,
          userRef: context.actorIdentity,
          errorMessage,
        }
      );

      throw error;
    }

    context.logger.info(
      'Successfully synchronized mutative data erasure blocks',
      {
        safeSource: input.safeSource,
        userRef: context.actorIdentity,
      }
    );

    return {
      response: `Embeddings deleted for source ${input.safeSource}`,
    };
  }
}
