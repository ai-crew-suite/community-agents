/*
 * Copyright 2024 Larder Software Limited
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
import {
  createBackendPlugin,
  coreServices,
  createExtensionPoint,
} from '@backstage/backend-plugin-api';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import {
  agentExtensionPoint,
  AgentDefinition,
  ArtifactSink,
  AuditLogSink,
  CheckpointStore,
  chatModelsExtensionPoint,
  workflowRunnerExtensionPoint,
  RunStore,
  runtimeStoreExtensionPoint,
  SessionStore,
  sourceExtensionPoint,
  toolExtensionPoint,
  ToolDefinition,
  triggerExtensionPoint,
  TriggerBinding,
  WorkflowDefinition,
} from '@ai-crew-suite/plugin-kernel-node';
import { ValidationRule } from '@ai-crew-suite/plugin-kernel-node'; // Now cleanly shared from node library
//import { InMemoryToolRegistry } from '../../../databases/capabilities/ToolRegistry';
import { createRouter } from './api/router';
import {
  AgentRateLimiter,
  createAiBackendServices,
  createSourceRegistry,
} from './services';

export interface WorkflowValidationExtensionPoint {
  registerValidator(rule: ValidationRule): void;
}

export const workflowValidationExtensionPoint =
  createExtensionPoint<WorkflowValidationExtensionPoint>({
    id: 'kernel.workflow.validation',
  });

/**
 * Registers and boots the AI backend runtime.
 */
export const ragAiPlugin = createBackendPlugin({
  pluginId: 'kernel',
  register(env) {
    const sourceRegistry = createSourceRegistry();
    const models = new Map<string, BaseChatModel>();
    const tools = new Map<string, ToolDefinition>();
    const agents = new Map<string, AgentDefinition>();
    const triggers: TriggerBinding[] = [];
    const workflowDefinitions = new Map<string, WorkflowDefinition>();
    const customValidationRules: ValidationRule[] = [];

    const runtimeStores: {
      sessionStore?: SessionStore;
      checkpointStore?: CheckpointStore;
      runStore?: RunStore;
      artifactSink?: ArtifactSink;
      auditLogSink?: AuditLogSink;
    } = {};

    env.registerExtensionPoint(workflowValidationExtensionPoint, {
      registerValidator(rule: ValidationRule) {
        customValidationRules.push(rule);
      },
    });

    env.registerExtensionPoint(sourceExtensionPoint, {
      addSource(source) {
        if (sourceRegistry.has(source.id)) {
          throw new Error(`Source '${source.id}' may only be registered once`);
        }
        sourceRegistry.register(source);
      },
    });

    env.registerExtensionPoint(chatModelsExtensionPoint, {
      addChatModel(modelDefinition) {
        if (models.has(modelDefinition.id)) {
          throw new Error(`Model '${modelDefinition.id}' may only be registered once`);
        }
        models.set(modelDefinition.id, modelDefinition.model);
      },
    });

    env.registerExtensionPoint(toolExtensionPoint, {
      addTool(tool) {
        if (tools.has(tool.id)) {
          throw new Error(`Tool '${tool.id}' may only be registered once`);
        }
        tools.set(tool.id, tool);
      },
    });

    env.registerExtensionPoint(agentExtensionPoint, {
      addAgent(agent) {
        if (agents.has(agent.id)) {
          throw new Error(`Agent '${agent.id}' may only be registered once`);
        }
        agents.set(agent.id, agent);
      },
    });

    env.registerExtensionPoint(workflowRunnerExtensionPoint, {
      registerWorkflow(workflow) {
        if (workflowDefinitions.has(workflow.id)) {
          throw new Error(`Workflow '${workflow.id}' may only be registered once`);
        }
        workflowDefinitions.set(workflow.id, workflow);
      },
    });

    env.registerExtensionPoint(triggerExtensionPoint, {
      addTrigger(trigger) {
        triggers.push(trigger);
      },
    });

    env.registerExtensionPoint(runtimeStoreExtensionPoint, {
      setSessionStore(store) {
        if (runtimeStores.sessionStore) {
          throw new Error('SessionStore may only be registered once');
        }
        runtimeStores.sessionStore = store;
      },
      setCheckpointStore(store) {
        if (runtimeStores.checkpointStore) {
          throw new Error('CheckpointStore may only be registered once');
        }
        runtimeStores.checkpointStore = store;
      },
      setRunStore(store) {
        if (runtimeStores.runStore) {
          throw new Error('RunStore may only be registered once');
        }
        runtimeStores.runStore = store;
      },
      setArtifactSink(sink) {
        if (runtimeStores.artifactSink) {
          throw new Error('ArtifactSink may only be registered once');
        }
        runtimeStores.artifactSink = sink;
      },
      setAuditLogSink(sink) {
        if (runtimeStores.auditLogSink) {
          throw new Error('AuditLogSink may only be registered once');
        }
        runtimeStores.auditLogSink = sink;
      },
    });

    /*
    env.registerExtensionPoint(toolExtensionPoint, {
      addTool(tool) {
        // The registry handles validation guards and throws standard ConflictErrors natively
        toolRegistry.register(tool);
      },
    });
    */

    env.registerInit({
      deps: {
        logger: coreServices.logger,
        config: coreServices.rootConfig,
        httpRouter: coreServices.httpRouter,
        httpAuth: coreServices.httpAuth,
        permissions: coreServices.permissions,
        database: coreServices.database,
      },
      async init({ logger, config, httpRouter, httpAuth, permissions, database }) {
        logger.info('Initializing Backstage AI Kernel Engine: Compliance Core Mode...');

        // Strict Schema Configuration: Proactive boot-time connectivity probe
        const knexInstance = await database.getClient();

        // @TODO: Need to implement move of registry/ToolRegistry.ts to databases/capabilities
        //const capabilityStore = new DatabaseCapabilityStore(knexInstance, logger);
        // Lock the tool registry immediately before generating services or starting engines
        //capabilityStore.freeze();

        // Check if the current workspace config explicitly permits development mock seeding
        //const isDevSeedingEnabled = config.getOptionalBoolean('ai.development.enableMockToolpacks') ?? false;
        /*
        if (isDevSeedingEnabled) {
          logger.warn('⚠️ AUDIT NOTICE: Mounting local development placeholder toolpacks into CapabilityStore.');

          // Lazy-load the test utility bundle so it remains completely omitted from standard production runtimes
          const { createDefaultToolPackTools } = await import('./testUtils/ToolPacks');
          const mockTools = createDefaultToolPackTools(logger);

          for (const tool of mockTools) {
            // Direct assignment using custom structural Tool type conversions matching definitions
            await capabilityStore.save({
              id: tool.id,
              description: tool.description,
              schema: { type: 'object', properties: {} }, // Safe fallback placeholder schemas
              executor: tool.invoke
            });
          }
        }
        */
        try {
          await knexInstance.raw('SELECT 1');
          logger.info('Compliance Probe Success: CheckpointStore connection verified.');
        } catch (probeError) {
          logger.error('Compliance Probe Critical Failure: CheckpointStore could not be reached.');
          throw new Error(`System boot aborted due to database connection loss: ${probeError}`);
        }

        // 1. Initialize the stateful corporate governance rate limiter from configuration limits
        const rateLimitConfig = config.getOptionalNumber('ai.hardening.rateLimitPerMinute') ?? 0;
        const rateLimiter = new AgentRateLimiter(logger, rateLimitConfig);

        // 2. Assemble Injected Runtime Arrays
        const services = createAiBackendServices({
          logger,
          config,
          sourceRegistry,
          agents,
          tools,
          models,
          sessionStore: runtimeStores.sessionStore,
          checkpointStore: runtimeStores.checkpointStore,
          runStore: runtimeStores.runStore,
          artifactSink: runtimeStores.artifactSink,
          auditLogSink: runtimeStores.auditLogSink,
          triggers,
          workflowDefinitions,
        });

        // 3. Mount the high-security declarative router context surface
        const declarativeRouter = await createRouter({
          logger,
          config,
          httpAuth,
          permissions,
          agentRuntime: services.runtime,
          agents,
          consumeRateLimit: rateLimiter.consume.bind(rateLimiter), // Bound stateful callback function
          runStore: services.runStore,
          toolRegistry: services.toolRegistry,
          sessionStore: services.sessionStore,
          checkpointStore: services.checkpointStore,
          artifactSink: services.artifactSink,
          auditLogSink: services.auditLogSink,
        });

        httpRouter.use(declarativeRouter);
      },
    });
  },
});
