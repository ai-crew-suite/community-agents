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
import { InputError } from '@backstage/errors';
import { Command, CommandContext, PackedRequestInput } from './types';

/**
 * Abstract Base Command enforcing the Template Method Pattern.
 * Consolidates cross-cutting validation pipelines and infrastructure checks.
 */
export abstract class BaseKernelCommand<TInput, TOutput> implements Command<PackedRequestInput, TOutput> {
  public async execute(
    input: PackedRequestInput,
    context: CommandContext,
  ): Promise<TOutput> {
    // 1. Core Infrastructure Readiness Guard
    this.verifyInfrastructureDependencies();

    // 2. Automated Structural Type & Schema Validation Pass - Context added
    const validatedInput = this.validate(input, context);

    // 3. Permissions & Security Scope Verification
    await this.authorize(validatedInput, context);

    // 4. Pure Domain Action Execution Loop
    return await this.handle(validatedInput, context);
  }

  /**
   * Abstract validation hook. Subclasses implement Zod schema structural parsing here.
   */
  protected abstract validate(input: PackedRequestInput, context: CommandContext): TInput;

  /**
   * Abstract authorization hook. Encapsulates RBAC scopes and compliance gates.
   */
  protected abstract authorize(input: TInput, context: CommandContext): Promise<void>;

  /**
   * Pure domain execution context boundary. Guaranteed zero-any runtime.
   */
  protected abstract handle(input: TInput, context: CommandContext): Promise<TOutput>;

  /**
   * Automatically validates presence of backing adapters at boot runtime execution lines.
   */
  protected abstract verifyInfrastructureDependencies(): void;

  /**
   * Common helper utility allowing concrete subclasses to parse dual schemas uniformly.
   */
  protected parseCombinedSchemas(
    paramsSchema: { safeParse: (data: unknown) => any },
    bodySchema: { safeParse: (data: unknown) => any },
    input: PackedRequestInput
  ): { paramsData: any; bodyData: any } {
    const paramsResult = paramsSchema.safeParse(input.params);
    const bodyResult = bodySchema.safeParse(input.body);

    if (!paramsResult.success || !bodyResult.success) {
      const errorMsg = [
        ...(paramsResult.success ? [] : paramsResult.error.issues),
        ...(bodyResult.success ? [] : bodyResult.error.issues),
      ].map(i => i.message).join(', ');

      throw new InputError(`Invalid workflow criteria parameters: ${errorMsg}`);
    }

    return {
      paramsData: paramsResult.data,
      bodyData: bodyResult.data,
    };
  }
}
