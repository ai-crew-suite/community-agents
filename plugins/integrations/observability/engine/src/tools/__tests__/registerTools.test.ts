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
import { mockServices } from '@backstage/backend-test-utils';
import {
  ObservabilityDriver,
  ToolContext,
} from '@ai-crew-suite/plugin-kernel-node';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createObservabilityTools } from '../registerTools';

const ctx: ToolContext = {
  logger: mockServices.logger.mock(),
  identity: 'user:default/tester',
  runId: 'run-1',
  signal: new AbortController().signal,
};

const createDriver = (): ObservabilityDriver => ({
  providerId: 'test-telemetry',
  queryMetrics: vi.fn().mockResolvedValue([]),
  searchLogs: vi.fn().mockResolvedValue([]),
  searchTraces: vi.fn().mockResolvedValue([]),
  listDashboards: vi.fn().mockResolvedValue([]),
});

describe('createObservabilityTools', () => {
  let driver: ObservabilityDriver;

  const getTool = (id: string) => {
    const tool = createObservabilityTools({
      driver,
      logger: mockServices.logger.mock(),
    }).find(candidate => candidate.id === id);

    if (!tool) throw new Error(`Tool '${id}' was not registered`);
    return tool;
  };

  beforeEach(() => {
    driver = createDriver();
  });

  it('delegates metric queries to the driver', async () => {
    await getTool('observability.metrics.query').invoke(
      { query: 'avg:http.latency{service:checkout}', since: '2026-01-01T00:00:00.000Z' },
      ctx,
    );

    expect(driver.queryMetrics).toHaveBeenCalledWith({
      query: 'avg:http.latency{service:checkout}',
      since: '2026-01-01T00:00:00.000Z',
    });
  });

  it('delegates log search to the driver', async () => {
    await getTool('observability.logs.search').invoke(
      { service: 'checkout', levels: ['error'] },
      ctx,
    );

    expect(driver.searchLogs).toHaveBeenCalledWith({
      service: 'checkout',
      levels: ['error'],
    });
  });

  it('delegates trace search to the driver', async () => {
    await getTool('observability.traces.search').invoke(
      { service: 'checkout', errorOnly: true },
      ctx,
    );

    expect(driver.searchTraces).toHaveBeenCalledWith({
      service: 'checkout',
      errorOnly: true,
    });
  });

  it('delegates dashboard listing to the driver', async () => {
    await getTool('observability.dashboard.list').invoke({ team: 'payments' }, ctx);

    expect(driver.listDashboards).toHaveBeenCalledWith({ team: 'payments' });
  });

  it('requires a query string for metric lookups', async () => {
    await expect(
      getTool('observability.metrics.query').invoke({}, ctx),
    ).rejects.toThrow(/'query'/);
  });

  it('marks every telemetry tool as read-only', () => {
    const tools = createObservabilityTools({
      driver,
      logger: mockServices.logger.mock(),
    });

    expect(tools.every(tool => tool.effect === 'read')).toBe(true);
  });
});
