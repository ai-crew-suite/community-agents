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
import {
  createAiBackendServices,
  createRouter,
  createSourceRegistry,
} from './service';

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

    env.registerInit({
      deps: {
        logger: coreServices.logger,
        config: coreServices.rootConfig,
        httpRouter: coreServices.httpRouter,
      },
      async init({ logger, config, httpRouter }) {
        logger.debug(`Registered ${triggers.length} AI triggers`);

        // Clean, type-safe assignment using the new optional customRules definition property
        for (const [id, def] of workflowDefinitions.entries()) {
          def.customRules = [...(def.customRules ?? []), ...customValidationRules];
          workflowDefinitions.set(id, def);
        }

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

        httpRouter.use(
          createRouter({
            logger,
            config,
            sourceRegistry: services.sourceRegistry,
            // Greenfield Goal: services.controller implements RouteController perfectly
            controller: services.controller,
          }),
        );
      },
    });
  },
});
