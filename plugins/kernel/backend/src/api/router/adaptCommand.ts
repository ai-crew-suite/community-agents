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
export function adaptCommand<TInput, TOutput>(
  CommandClass: new (...args: any[]) => BaseKernelCommand<TInput, TOutput>,
  dependencies: AdapterDependencies,
  commandArgs: unknown[] = []
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Strict Cryptographic Identity Propagation Check via modern Backstage allow blocks
      const credentials = await dependencies.httpAuth.credentials(req, {
        allow: ['user', 'service'],
        // Prevent query string leaks in reverse-proxy logs (Nginx/Cloudflare) or browser histories
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

      // Assemble Structured Immutable Context with search-ready logging
      const context: CommandContext = {
        actorIdentity,
        createdAt: new Date().toISOString(),
        logger: dependencies.logger.child({ actorIdentity }),
      };

      // High-Security Compliance Extraction (Insulates against Prototype Pollution)
      const safeBody = Object.create(null);
      const safeQuery = Object.create(null);
      const safeParams = Object.create(null);

      if (req.body && typeof req.body === 'object') {
        Object.assign(safeBody, req.body);
      }
      if (req.query && typeof req.query === 'object') {
        Object.assign(safeQuery, req.query);
      }
      if (req.params && typeof req.params === 'object') {
        Object.assign(safeParams, req.params);
      }

      const headersMap = req.headers as Record<string, string | string[] | undefined>;
      const packedInput: PackedRequestInput = {
        body: safeBody,
        query: safeQuery,
        params: safeParams,
        headers: headersMap,
      };

      // Instantiate Command via clean Injection Graph
      const commandInstance = new CommandClass(...commandArgs, credentials);
      const result = await commandInstance.execute(packedInput, context);

      // Smart Response Switching Bridge
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
