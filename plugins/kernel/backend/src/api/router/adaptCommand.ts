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
import { NotAllowedError } from '@backstage/errors';
import { LoggerService, HttpAuthService } from '@backstage/backend-plugin-api';
import { BaseKernelCommand } from '../commands/BaseKernelCommand';
import {
  BaseCommandOptions,
  CommandContext,
  PackedRequestInput,
  StreamExecutionFunction,
  FlushingResponse,
} from '../commands/types';

export type AdapterDependencies = {
  readonly logger: LoggerService;
  readonly httpAuth: HttpAuthService;
};

interface BackstageUserPrincipal {
  readonly userEntityRef: string;
}

interface BackstageServicePrincipal {
  readonly subject: string;
}

function isUserPrincipal(principal: unknown): principal is BackstageUserPrincipal {
  return typeof principal === 'object' && principal !== null && 'userEntityRef' in principal;
}

function isServicePrincipal(principal: unknown): principal is BackstageServicePrincipal {
  return typeof principal === 'object' && principal !== null && 'subject' in principal;
}

/**
 * Express adapter transforming an HTTP boundary context into a Command execution loop.
 * Guarantees SOC-2 compliant audit trails and uniform error filtering.
 */
export function adaptCommand<TInput, TOutput, TOptions extends BaseCommandOptions>(
  CommandClass: new (options: TOptions) => BaseKernelCommand<TInput, TOutput>,
  dependencies: AdapterDependencies,
  config: {
    // Omit 'credentials' from the required deps since the adapter injects it dynamically
    commandDeps: Omit<TOptions, 'credentials'>;
  }
) {
  const { commandDeps } = config;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const credentials = await dependencies.httpAuth.credentials(req, {
        allow: ['user', 'service'],
        allowLimitedAccess: false,
      });

      if (!credentials || !credentials.principal) {
        throw new NotAllowedError('Access Denied: Missing valid Backstage authentication principal.');
      }

      let actorIdentity = '';
      const principal = credentials.principal;

      if (isUserPrincipal(principal)) {
        actorIdentity = principal.userEntityRef;
      } else if (isServicePrincipal(principal)) {
        actorIdentity = principal.subject;
      }

      if (!actorIdentity || typeof actorIdentity !== 'string') {
        throw new NotAllowedError('Access Denied: Non-repudiation contract breach. Invalid actor identity serialization.');
      }

      const context: CommandContext = {
        actorIdentity,
        createdAt: new Date().toISOString(),
        logger: dependencies.logger.child({ actorIdentity }),
      };

      const safeBody = Object.create(null);
      const safeQuery = Object.create(null);
      const safeParams = Object.create(null);

      if (req.body && typeof req.body === 'object') Object.assign(safeBody, req.body);
      if (req.query && typeof req.query === 'object') Object.assign(safeQuery, req.query);
      if (req.params && typeof req.params === 'object') Object.assign(safeParams, req.params);

      const packedInput: PackedRequestInput = {
        body: safeBody,
        query: safeQuery,
        params: safeParams,
        headers: req.headers as Record<string, string | string[] | undefined>,
      };

      const commandInstance = new CommandClass({
        ...(commandDeps as any), // Typecast needed here only inside the boundary adapter block
        credentials,
      });

      const result = await commandInstance.execute(packedInput, context);

      if (typeof result === 'function') {
        await (result as StreamExecutionFunction)(res as FlushingResponse);
      } else {
        if (!res.headersSent) {
          res.status(200).json(result);
        }
      }
    } catch (error) {
      next(error);
    }
  };
}

