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
import type {
  LoggerService,
  RootConfigService,
} from '@backstage/backend-plugin-api';
import type { SourceRegistry } from '@ai-crew-suite/plugin-kernel-node';
import { WorkflowController } from "../controller";

/** Minimal controller surface needed by the router binder. */
export type RouteController = Pick<
  WorkflowController,
  | 'createEmbeddings'
  | 'deleteEmbeddings'
  | 'getEmbeddings'
  | 'listAgents'
  | 'startRun'
  | 'streamRunEvents'
  | 'approveRun'
  | 'triggerRun'
  | 'webhookRun'
>;

/** Narrow route-binding contract for the express router. */
export interface CreateRouterOptions {
  logger: LoggerService;
  config: RootConfigService;
  sourceRegistry: SourceRegistry;
  controller: RouteController;
}
