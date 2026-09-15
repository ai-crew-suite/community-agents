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
// plugins/kernel/backend/src/api/router/index.ts
import express from 'express';
import Router from 'express-promise-router';
import { MiddlewareFactory } from '@backstage/backend-defaults/rootHttpRouter';
import { LoggerService, HttpAuthService, PermissionsService, RootConfigService } from '@backstage/backend-plugin-api';
import { adaptCommand } from './adaptCommand';

// Import Concrete CQRS Commands
import { StartRunCommand } from '../commands/StartRunCommand';
import { ApproveRunCommand } from '../commands/ApproveRunCommand';
import { StreamRunEventsCommand } from '../commands/StreamRunEventsCommand';

// Import Injected Services & Stores
import { AgentRuntime } from '../../runtime/AgentRuntime';
import { ToolRegistry, SessionStore, CheckpointStore, ArtifactSink, AuditLogSink, RunStore } from '@ai-crew-suite/plugin-kernel-node';

export type RouterOptions = {
  readonly logger: LoggerService;
  readonly httpAuth: HttpAuthService;
  readonly permissions: PermissionsService;
  readonly config: RootConfigService;

  // Decoupled Dependency Injection Graph
  readonly agentRuntime: AgentRuntime;
  readonly agents: Map<string, unknown>;
  readonly consumeRateLimit: (agentId: string) => boolean;
  readonly runStore?: RunStore;
  readonly toolRegistry?: ToolRegistry;
  readonly sessionStore?: SessionStore;
  readonly checkpointStore?: CheckpointStore;
  readonly artifactSink?: ArtifactSink;
  readonly auditLogSink?: AuditLogSink;
};

/**
 * Creates the high-security declarative HTTP router consumed by Backstage plugin wiring.
 * Completely eliminates inline route processing logic and manual status code writes.
 */
export async function createRouter(options: RouterOptions): Promise<express.Router> {
  const router = Router();
  router.use(express.json());

  const adapterDeps = {
    logger: options.logger,
    httpAuth: options.httpAuth,
    permissions: options.permissions,
  };

  /**
   * ============================================================================
   *   Declarative Routing Map via adaptCommand Middleware
   * ============================================================================
   */

  // 1. Initial Multi-Agent Workflow Initialization Track
  router.post(
    '/agents/:id/runs',
    adaptCommand(StartRunCommand, adapterDeps, [
      options.agents,
      options.consumeRateLimit,
      options.runStore,
      // Pass optional structural formatting overrides extracted safely from config boundaries
      options.config.getOptional('ai.hardening'),
    ])
  );

  // 2. Human-In-The-Loop Manual Checkpoint Supervisor Decision Track
  router.post(
    '/runs/:id/approvals',
    adaptCommand(ApproveRunCommand, adapterDeps, [
      options.agentRuntime,
      options.runStore,
      options.toolRegistry,
      options.sessionStore,
      options.checkpointStore,
      options.artifactSink,
      options.auditLogSink,
      options.config.getOptional('ai.hardening'),
    ])
  );

  // 3. Stateful Real-Time SSE Server Sent Token Streaming Track
  router.get(
    '/runs/:id/events',
    adaptCommand(StreamRunEventsCommand, adapterDeps, [
      options.agentRuntime,
      options.runStore,
      options.toolRegistry,
      options.sessionStore,
      options.checkpointStore,
      options.artifactSink,
      options.auditLogSink,
      options.config.getOptional('ai.hardening'),
    ])
  );

  // Central platform error handler handles structural sanitization and serialization
  const middleware = MiddlewareFactory.create({ config: options.config, logger: options.logger });
  router.use(middleware.error());

  return router;
}
