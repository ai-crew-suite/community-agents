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
import { Request, Response, NextFunction } from 'express';
import { 
  AuthorizeResult,
  NotAllowedError,
} from '@backstage/errors';
import {
  LoggerService,
  HttpAuthService,
  PermissionsService,
} from '@backstage/backend-plugin-api';
import { BaseKernelCommand } from '../commands/BaseKernelCommand';
import {
  CommandContext,
  PackedRequestInput,
} from '../commands/types';

export type AdapterDependencies = {
  readonly logger: LoggerService;
  readonly httpAuth: HttpAuthService;
  readonly permissions: PermissionsService;
};

/**
 * Express adapter transforming an HTTP boundary context into a Command execution loop.
 * Guarantees SOC-2 compliant audit trails and uniform error filtering.
 */
export function adaptCommand<TInput, TOutput>(
  CommandClass: new (...args: any[]) => BaseKernelCommand<TInput, TOutput>,
  dependencies: AdapterDependencies,
  commandArgs: unknown[] = []
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // 1. Strict Cryptographic Identity Propagation Check
      const credentials = await dependencies.httpAuth.credentials(req, {
        allowUserToken: true,
        allowServiceToken: true,
      });

      if (!credentials || !credentials.principal) {
        throw new NotAllowedError('Access Denied: Missing valid Backstage authentication principal.');
      }

      // Convert principal token metadata to non-nullable string reference format
      const actorIdentity = credentials.principal.userEntityRef || credentials.principal.subject;
      if (!actorIdentity || typeof actorIdentity !== 'string') {
        throw new NotAllowedError('Access Denied: Non-repudiation contract breach. Invalid actor identity serialization.');
      }

      // 2. Assemble Structured Immutable Context with search-ready logging
      const context: CommandContext = {
        actorIdentity,
        createdAt: new Date().toISOString(),
        logger: dependencies.logger.child({ actorIdentity }),
      };

      // 3. Collect Request Payload Fields Safely
      const packedInput: PackedRequestInput = {
        body: (req.body && typeof req.body === 'object') ? (req.body as Record<string, unknown>) : {},
        query: (req.query && typeof req.query === 'object') ? (req.query as Record<string, unknown>) : {},
        params: (req.params && typeof req.params === 'object') ? (req.params as Record<string, unknown>) : {},
      };

      // 4. Instantiate Command via Dependency Injection and Execute Template Skeleton
      const commandInstance = new CommandClass(...commandArgs, dependencies.permissions, credentials);
      const result = await commandInstance.execute(packedInput, context);

      // 5. Centralized Response Egress Serialization (Bypassing direct status write loops)
      if (!res.headersSent) {
        res.status(200).json(result);
      }
    } catch (error) {
      // Bubble unhandled platform errors directly out to centralized platform middleware
      next(error);
    }
  };
}
