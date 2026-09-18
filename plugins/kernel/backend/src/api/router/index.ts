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
import express from 'express';
import Router from 'express-promise-router';
import { MiddlewareFactory } from '@backstage/backend-defaults/rootHttpRouter';
import { LoggerService, HttpAuthService, PermissionsService, RootConfigService } from '@backstage/backend-plugin-api';
import { adaptCommand } from './adaptCommand';
import {
  RunStore,
  ToolRegistry,
  SessionStore,
  CheckpointStore,
  ArtifactSink,
  AuditLogSink,
  TriggerBinding,
  AugmentationIndexer,
  RetrievalPipeline
} from '@ai-crew-suite/plugin-kernel-node';
import {
  StartRunCommand,
  ApproveRunCommand,
  StreamRunEventsCommand,
  CreateEmbeddingsCommand,
  DeleteEmbeddingsCommand,
  GetEmbeddingsCommand,
  TriggerRunCommand,
  WebhookRunCommand,
} from '../commands';
import type { AgentRuntime } from '../../runtime/AgentRuntime';

export type RouterOptions = {
  readonly logger: LoggerService;
  readonly httpAuth: HttpAuthService;
  readonly permissions: PermissionsService;
  readonly config: RootConfigService;
  // Fully Wired Dependency Injection Graph
  readonly agentRuntime: AgentRuntime;
  readonly agents: Map<string, unknown>;
  readonly consumeRateLimit: (agentId: string) => boolean;
  // Re-added sub-system store interfaces to clear missing property flags
  readonly runStore?: RunStore;
  readonly toolRegistry?: ToolRegistry;
  readonly sessionStore?: SessionStore;
  readonly checkpointStore?: CheckpointStore;
  readonly artifactSink?: ArtifactSink;
  readonly auditLogSink?: AuditLogSink;
  readonly triggers: TriggerBinding[];
  readonly augmentationIndexer?: AugmentationIndexer;
  readonly retrievalPipeline?: RetrievalPipeline;
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

  const hardening = options.config.getOptional('ai.hardening');

  /**
   * ============================================================================
   *   Declarative Routing Map via adaptCommand Middleware
   * ============================================================================
   */

  // Initial Multi-Agent Workflow Initialization Track
  router.post(
    '/agents/:id/runs',
    adaptCommand(StartRunCommand, adapterDeps, {
      agents: options.agents,
      consumeRateLimit: options.consumeRateLimit,
      runStore: options.runStore,
      hardening,
    })
  );

  // Human-In-The-Loop Manual Checkpoint Supervisor Decision Track
  router.post(
    '/runs/:id/approvals',
    adaptCommand(ApproveRunCommand, adapterDeps, {
      agentRuntime: options.agentRuntime,
      runStore: options.runStore,
      toolRegistry: options.toolRegistry,
      sessionStore: options.sessionStore,
      checkpointStore: options.checkpointStore,
      artifactSink: options.artifactSink,
      auditLogSink: options.auditLogSink,
      hardening,
    })
  );

  // Stateful Real-Time SSE Server Sent Token Streaming Track
  router.get(
    '/runs/:id/events',
    adaptCommand(StreamRunEventsCommand, adapterDeps, {
      agentRuntime: options.agentRuntime,
      runStore: options.runStore,
      toolRegistry: options.toolRegistry,
      sessionStore: options.sessionStore,
      checkpointStore: options.checkpointStore,
      artifactSink: options.artifactSink,
      auditLogSink: options.auditLogSink,
      hardening,
    })
  );

  // Create / Append Catalog Vector Embedding Records Track
  router.post(
    '/embeddings/:source',
    adaptCommand(CreateEmbeddingsCommand, adapterDeps, {
      commandDeps: {
        permissions: options.permissions,
        augmentationIndexer: options.augmentationIndexer,
      },
    })
  );

  // Delete / Purge Catalog Vector Embedding Records Track
  router.delete(
    '/embeddings/:source',
    adaptCommand(DeleteEmbeddingsCommand, adapterDeps, {
      commandDeps: {
        permissions: options.permissions,
        augmentationIndexer: options.augmentationIndexer,
        hardening: options.config.getOptional('ai.hardening'),
      },
    })
  );

  // Semantic Context Augmentation Vector Retrieval Track
  router.get(
    '/embeddings/:source',
    adaptCommand(GetEmbeddingsCommand, adapterDeps, {
      commandDeps: {
        permissions: options.permissions,
        retrievalPipeline: options.retrievalPipeline,
        hardening,
      },
    })
  );

  // Trigger Track
  router.post(
    '/triggers/:source',
    adaptCommand(TriggerRunCommand, adapterDeps, {
      agentRuntime: options.agentRuntime,
      triggersList: options.triggers,
      agentsMap: options.agents,
      hardeningOptions: hardening,
      permissions: options.permissions,
    })
  );

  // Public Third-Party Perimeter Webhook Alert Ingestion Track
  router.post(
    '/webhooks/:provider',
    adaptCommand(WebhookRunCommand, adapterDeps, {
      agentRuntime: options.agentRuntime,
      triggersList: options.triggers,
      agentsMap: options.agents,
      hardeningOptions: hardening,
      permissions: options.permissions,
    })
  );

  // Central platform error handler handles structural sanitization and serialization
  const middleware = MiddlewareFactory.create({ config: options.config, logger: options.logger });

  router.use(middleware.error());

  return router;
}
