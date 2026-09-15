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
import express from 'express';
import Router from 'express-promise-router';
import { MiddlewareFactory } from '@backstage/backend-defaults/rootHttpRouter';
import { LoggerService, HttpAuthService, PermissionsService, RootConfigService } from '@backstage/backend-plugin-api';
import { adaptCommand, AdapterDependencies } from './adaptCommand';

// Core Command Registrations will be imported here
// import { StartRunCommand } from '../commands/StartRunCommand';
// import { ApproveRunCommand } from '../commands/ApproveRunCommand';

export type RouterOptions = {
  readonly logger: LoggerService;
  readonly httpAuth: HttpAuthService;
  readonly permissions: PermissionsService;
  readonly config: RootConfigService;
  readonly runtimeDependencies: unknown[]; // Injected stores, sinks, and execution runtimes
};

export async function createRouter(options: RouterOptions): Promise<express.Router> {
  const router = Router();
  router.use(express.json());

  const adapterDeps: AdapterDependencies = {
    logger: options.logger,
    httpAuth: options.httpAuth,
    permissions: options.permissions,
  };

  /**
   * ============================================================================
   *   Declarative Routing Map via adaptCommand
   * ============================================================================
   */

  // Example Route Blueprinting:
  // router.post('/agents/:id/runs', adaptCommand(StartRunCommand, adapterDeps, [...options.runtimeDependencies]));
  // router.post('/runs/:id/approvals', adaptCommand(ApproveRunCommand, adapterDeps, [...options.runtimeDependencies]));

  // Rely exclusively on Backstage platform error sanitization middleware
  const middleware = MiddlewareFactory.create({ config: options.config, logger: options.logger });
  router.use(middleware.error());

  return router;
}
