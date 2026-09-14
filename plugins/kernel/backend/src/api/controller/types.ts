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
import type { LoggerService, HttpAuthService, PermissionsService } from '@backstage/backend-plugin-api';
import type { Request } from 'express';
import {
  AgentDefinition,
  AgentEvent,
  ArtifactSink,
  AuditLogSink,
  AugmentationIndexer,
  CheckpointStore,
  HardeningOptions,
  RetrievalPipeline,
  RunStore,
  SessionStore,
  ToolRegistry,
  TriggerBinding,
} from '@ai-crew-suite/plugin-kernel-node';
import { AgentRuntime } from '../../runtime'

/**
 * Clean architectural definition for the bounded Controller Execution Context.
 * Eliminates open index signatures and maps parameters natively using strong typing.
 */
export interface ControllerContext {
  readonly agents: Map<string, AgentDefinition>;
  readonly artifactSink?: ArtifactSink;
  readonly auditLogSink?: AuditLogSink;
  readonly augmentationIndexer: AugmentationIndexer;
  readonly checkpointStore?: CheckpointStore;
  readonly consumeRateLimit: (key: string) => boolean;
  readonly fromStoredStep: (type: AgentEvent['type'], payload: unknown) => AgentEvent | undefined; // Swap 'any' for real AgentEvent type if available
  readonly hardening: HardeningOptions;
  readonly httpAuth: HttpAuthService;
  readonly identity: (req: Request) => Promise<string>;
  readonly logger: LoggerService;
  readonly parseLastEventId: (value?: string) => number;
  readonly permissions: PermissionsService;
  readonly retrievalPipeline?: RetrievalPipeline;
  readonly runStore?: RunStore;
  readonly runtime: AgentRuntime;
  readonly sessionStore?: SessionStore;
  readonly toolRegistry: ToolRegistry;
  readonly triggers: TriggerBinding[];
  readonly validateSource: (source: string | undefined) => string;
}

/**
 * Parameter configuration block passed to initialize the WorkflowController.
 * Consolidates system dependencies into an object pattern to ensure greenfield maintainability.
 */
export interface WorkflowControllerOptions {
  readonly agents: Map<string, AgentDefinition>;
  readonly artifactSink?: ArtifactSink;
  readonly auditLogSink?: AuditLogSink;
  readonly augmentationIndexer: AugmentationIndexer;
  readonly checkpointStore?: CheckpointStore;
  readonly hardening?: HardeningOptions;
  readonly httpAuth: HttpAuthService;
  readonly logger: LoggerService;
  readonly permissions: PermissionsService;
  readonly retrievalPipeline?: RetrievalPipeline;
  readonly runStore?: RunStore;
  readonly runtime: AgentRuntime;
  readonly sessionStore?: SessionStore;
  readonly toolRegistry: ToolRegistry;
  readonly triggers?: TriggerBinding[];
}

/** Run orchestration routes */
export interface StreamRunRouteParams extends Record<string, string> {
  readonly runId: string;
}

/**  Valid tracking query parameters for incoming requests */
export interface StreamRunQueryParams extends Record<string, string | string[] | undefined> {
  readonly lastEventId?: string;
}
