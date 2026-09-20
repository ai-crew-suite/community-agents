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
  SchedulerService,
} from '@backstage/backend-plugin-api';
import { ALERT_AI_TUNER_AGENT_ID } from '../agent';
import type { AlertAiTunerConfig } from '../config';
import { planSweep } from './sweepPlanner';

/** Stable scheduler task identifier for the weekly noise sweep. */
export const ALERT_AI_TUNER_SWEEP_TASK_ID = 'alert-ai-tuner-weekly-sweep';

/**
 * Registers the weekly noise sweep as a single global scheduler task.
 *
 * The task dispatches one authenticated run per planned service to the AI Core
 * run route; it never executes the workflow in-process. Dispatches are
 * sequential and guarded by an in-flight mutex so a slow week cannot overlap
 * itself, and every planned request is propose-only.
 *
 * @param deps - Core Backstage services plus the resolved tuner configuration.
 */
export const registerWeeklySweep = (deps: {
  scheduler: SchedulerService;
  discovery: DiscoveryService;
  auth: AuthService;
  logger: LoggerService;
  config: AlertAiTunerConfig;
}): void => {
  let inFlight = false;

  deps.scheduler.scheduleTask({
    id: ALERT_AI_TUNER_SWEEP_TASK_ID,
    frequency: { cron: deps.config.sweep.cron },
    timeout: { minutes: 30 },
    initialDelay: { minutes: 5 },
    scope: 'global',
    fn: async () => {
      if (inFlight) {
        deps.logger.info('Alert tuning sweep skipped: a previous sweep is still running');
        return;
      }
      inFlight = true;

      try {
        const plans = planSweep({
          services: deps.config.sweep.services,
          windowDays: deps.config.windowDays,
          maxSweepAlerts: deps.config.sweep.maxSweepAlerts,
          cooldownDays: deps.config.sweep.cooldownDays,
        });

        if (plans.length === 0) {
          return;
        }

        const base = await deps.discovery.getBaseUrl('ai-core');
        const { token } = await deps.auth.getPluginRequestToken({
          onBehalfOf: await deps.auth.getOwnServiceCredentials(),
          targetPluginId: 'ai-core',
        });

        for (const plan of plans) {
          try {
            const response = await fetch(`${base}/agents/${ALERT_AI_TUNER_AGENT_ID}/runs`, {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                idempotencyKey: plan.id,
                input: { query: JSON.stringify(plan.request) },
              }),
            });

            if (!response.ok) {
              deps.logger.warn('Alert tuning sweep dispatch was rejected', {
                status: response.status,
                service: plan.request.service,
              });
            }
          } catch (error) {
            deps.logger.warn('Alert tuning sweep dispatch failed', {
              service: plan.request.service,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      } catch (error) {
        deps.logger.error('Alert tuning sweep could not start', {
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        inFlight = false;
      }
    },
  });
};
