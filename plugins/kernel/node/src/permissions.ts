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
import { createPermission } from '@backstage/plugin-permission-common';

/**
 * AI Core resource permission definitions using the new Backstage permissions framework. Declared
 * natively via type utilities to mandate structural resourceRef scopes during execution checks.
 */
export const aiPermissions = {

  /**
   * ====================================================================
   *   Workflow related permissions
   * ====================================================================
   */

  agentRun: createPermission({
    name: 'ai.agent.run',
    attributes: {},
    resourceType: 'agent',
  }),

  agentApprove: createPermission({
    name: 'ai.agent.approve',
    attributes: {},
    resourceType: 'agent',
  }),

  runRead: createPermission({
    name: 'ai.run.read',
    attributes: {},
    resourceType: 'run',
  }),

  /**
   * ====================================================================
   *   Vector Database Embeddings related permissions
   * ====================================================================
   */

  embeddingsRead: createPermission({
    name: 'ai.embeddings.read',
    attributes: {},
    resourceType: 'embeddings',
  }),

  embeddingsWrite: createPermission({
    name: 'ai.embeddings.write',
    attributes: {},
    resourceType: 'embeddings',
  }),

  embeddingsDelete: createPermission({
    name: 'ai.embeddings.delete',
    attributes: {},
    resourceType: 'embeddings',
  }),

  /**
   * ====================================================================
   *   Automated Infrastructure Tokens related permissions
   * ====================================================================
   */

  infrastructureTrigger: createPermission({
    name: 'ai.infrastructure.trigger',
    attributes: {},
    resourceType: 'infrastructure',
  }),

  webhookIngest: createPermission({
    name: 'ai.webhook.ingest',
    attributes: {},
    resourceType: 'webhook',
  }),
} as const;
