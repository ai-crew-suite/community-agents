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
import { LoggerService } from '@backstage/backend-plugin-api';
import {
  DashboardQuery,
  LogQuery,
  MetricsQuery,
  ObservabilityDriver,
  ToolDefinition,
  TraceQuery,
} from '@ai-crew-suite/plugin-kernel-node';

export interface CreateObservabilityToolsOptions {
  driver: ObservabilityDriver;
  logger: LoggerService;
}

/**
 * Creates the stable telemetry tool definitions backed by the resolved driver.
 *
 * Every tool is read-only. Telemetry platforms are a source of evidence for
 * agents, never a target for autonomous writes.
 */
export const createObservabilityTools = (
  options: CreateObservabilityToolsOptions,
): ToolDefinition[] => {
  const { driver, logger } = options;

  return [
    {
      id: 'observability.metrics.query',
      description:
        'Runs a provider-native metric query over a bounded time window.',
      effect: 'read',
      async invoke(args: unknown) {
        const payload = args as MetricsQuery;
        logger.debug('observability.metrics.query invoked', {
          query: payload?.query,
        });

        if (!payload?.query) {
          throw new Error("Missing required argument: 'query'");
        }

        return driver.queryMetrics(payload);
      },
    },
    {
      id: 'observability.logs.search',
      description:
        'Searches logs by service, severity, and time window to surface error spikes.',
      effect: 'read',
      async invoke(args: unknown) {
        const payload = (args ?? {}) as LogQuery;
        logger.debug('observability.logs.search invoked', {
          service: payload.service,
        });

        return driver.searchLogs(payload);
      },
    },
    {
      id: 'observability.traces.search',
      description:
        'Searches distributed trace spans by service, operation, error status, or duration.',
      effect: 'read',
      async invoke(args: unknown) {
        const payload = (args ?? {}) as TraceQuery;
        logger.debug('observability.traces.search invoked', {
          service: payload.service,
          operation: payload.operation,
        });

        return driver.searchTraces(payload);
      },
    },
    {
      id: 'observability.dashboard.list',
      description:
        'Lists provider-hosted dashboards relevant to a service or team.',
      effect: 'read',
      async invoke(args: unknown) {
        const payload = (args ?? {}) as DashboardQuery;
        logger.debug('observability.dashboard.list invoked', {
          service: payload.service,
          team: payload.team,
        });

        return driver.listDashboards(payload);
      },
    },
  ];
};
