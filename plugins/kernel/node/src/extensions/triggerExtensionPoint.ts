/**
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
import { createExtensionPoint } from '@backstage/backend-plugin-api';
import type { TriggerBinding } from '../types';

/**
 * Extension point that allows backend modules to register event-driven hooks and triggers
 * (e.g., webhook listeners, cron routines, or message queue consumers) into the central AI agent runtime.
 *
 * Registered triggers intercept external platform events and automatically instantiate and route
 * them to execute a specific, pre-configured `AgentDefinition`.
 */
export interface TriggerExtensionPoint {
  addTrigger(trigger: TriggerBinding): void;
}

export const triggerExtensionPoint = createExtensionPoint<TriggerExtensionPoint>({
  id: 'plugin-agent.triggers',
});
