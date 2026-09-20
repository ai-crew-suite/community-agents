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
import type { CatalogEntityResolver } from '@ai-crew-suite/plugin-kernel-node';
import type { CatalogAiInsightsConfig } from '../config';
import { planScan } from './scanPlanner';
import { CATALOG_AI_INSIGHTS_AGENT_ID } from '../agent';

/**
 * Stable scheduler task ID for the nightly catalog scan.
 */
export const NIGHTLY_SCAN_TASK_ID = 'catalog-ai-insights-nightly-scan';

export type NightlyScanDeps = {
  scheduler: SchedulerService;
  discovery: DiscoveryService;
  auth: AuthService;
  logger: LoggerService;
  resolver: CatalogEntityResolver;
  config: CatalogAiInsightsConfig['scan'];
};

/**
 * Registers the nightly catalog scan task. The task lists components carrying
 * the `backstage.io/kubernetes-id` annotation, plans a bounded set of
 * deployment-health probes, and dispatches one authenticated run per entity
 * to the generic AI Core run route — scheduled runs are persisted, replayable,
 * and auditable exactly like manual runs; the graph is never invoked
 * in-process here.
 *
 * Guardrails: a module-scoped mutex skips a scan while the previous one is
 * still dispatching, entities are capped by `maxScanEntities`, and the caller
 * only registers the task when `scan.enabled` is true.
 */
export const registerNightlyScanTask = (deps: NightlyScanDeps): void => {
  const { scheduler, discovery, auth, logger, resolver, config } = deps;

  let scanInFlight = false;

  scheduler.scheduleTask({
    id: NIGHTLY_SCAN_TASK_ID,
    frequency: { cron: config.cron },
    timeout: { minutes: 10 },
    initialDelay: { minutes: 1 },
    scope: 'global',
    fn: async () => {
      if (scanInFlight) {
        logger.info('Nightly catalog scan skipped: previous scan still in flight');
        return;
      }
      scanInFlight = true;
      try {
        const entities = await resolver.findByAnnotation({
          annotation: 'backstage.io/kubernetes-id',
          value: '',
          kinds: ['Component'],
          limit: config.maxScanEntities,
        });
        const plan = planScan({
          entities,
          maxScanEntities: config.maxScanEntities,
        });
        if (plan.length === 0) {
          logger.info('Nightly catalog scan found no annotated components');
          return;
        }

        const baseUrl = await discovery.getBaseUrl('ai-core');
        const { token } = await auth.getPluginRequestToken({
          onBehalfOf: await auth.getOwnServiceCredentials(),
          targetPluginId: 'ai-core',
        });

        let dispatched = 0;
        for (const item of plan) {
          const response = await fetch(
            `${baseUrl}/agents/${CATALOG_AI_INSIGHTS_AGENT_ID}/runs`,
            {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ query: JSON.stringify(item.request) }),
            },
          );
          if (response.ok) {
            dispatched += 1;
          } else {
            logger.warn('Nightly scan run dispatch was rejected', {
              entityRef: item.entityRef,
              status: response.status,
            });
          }
        }
        logger.info('Nightly catalog scan dispatched insight runs', {
          planned: plan.length,
          dispatched,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error('Nightly catalog scan failed', { error: message });
      } finally {
        scanInFlight = false;
      }
    },
  });
};
