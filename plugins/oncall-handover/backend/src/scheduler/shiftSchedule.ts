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
  AuthService, 
  DiscoveryService, 
  LoggerService, 
  SchedulerService 
} from '@backstage/backend-plugin-api';
import { ONCALL_HANDOVER_AGENT_ID } from '../agent';
import { planShiftSchedule } from './schedulePlanner';

/**
 * Registers persisted, authenticated dispatches for each configured shift boundary.
 * Maps cron configurations to scheduled background tasks that hit the backend AI agent endpoint.
 *
 * @param deps - The Backstage core service dependencies required for scheduling and requests.
 * @param deps.scheduler - Core Backstage distributed task manager service.
 * @param deps.discovery - Service mesh address locator endpoint coordinator.
 * @param deps.auth - Plugin-to-plugin security credentials builder token generator.
 * @param deps.logger - Central operational standard system streams logging manager.
 * @param deps.config - Unwrapped schema boundaries containing shift schedules and window parameters.
 * @returns void
 */
export const registerShiftSchedule = (deps: {
  scheduler: SchedulerService;
  discovery: DiscoveryService;
  auth: AuthService;
  logger: LoggerService;
  config: {
    windowHours: number;
    schedule: {
      shifts: { cron: string; team: string }[];
    };
  };
}): void => {
  const schedulePlan = planShiftSchedule({
    shifts: deps.config.schedule.shifts,
    windowHours: deps.config.windowHours,
  });

  for (const plan of schedulePlan) {
    let inFlight = false;

    deps.scheduler.scheduleTask({
      id: plan.id,
      frequency: { cron: plan.cron },
      timeout: { minutes: 10 },
      initialDelay: { minutes: 1 },
      scope: 'global',
      fn: async () => {
        if (inFlight) return;
        inFlight = true;

        try {
          const base = await deps.discovery.getBaseUrl('ai-core');
          
          const { token } = await deps.auth.getPluginRequestToken({
            onBehalfOf: await deps.auth.getOwnServiceCredentials(),
            targetPluginId: 'ai-core',
          });

          const response = await fetch(`${base}/agents/${ONCALL_HANDOVER_AGENT_ID}/runs`, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ query: JSON.stringify(plan.request) }),
          });

          if (!response.ok) {
            deps.logger.warn('Handover shift dispatch was rejected', {
              status: response.status,
              team: plan.request.team,
            });
          }
        } catch (error) {
          deps.logger.error('Handover shift dispatch failed', {
            error: error instanceof Error ? error.message : String(error),
          });
        } finally {
          inFlight = false;
        }
      },
    });
  }
};
