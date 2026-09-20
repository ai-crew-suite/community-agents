import { mockServices } from '@backstage/backend-test-utils';
import {
  KubernetesDiagnosticsDriver,
  ToolContext,
} from '../../../../../kernel/node/src';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createKubernetesDiagnosticsTools } from '../registerTools';

const ctx: ToolContext = {
  logger: mockServices.logger.mock(),
  identity: 'user:default/tester',
  runId: 'run-1',
  signal: new AbortController().signal,
};

const createDriver = (): KubernetesDiagnosticsDriver => ({
  providerId: 'backstage',
  resolveWorkloads: vi.fn().mockResolvedValue([]),
  getWorkloadSnapshot: vi.fn(),
  getPodSnapshot: vi.fn(),
  getPodLogs: vi.fn(),
  listWorkloadEvents: vi.fn().mockResolvedValue([]),
  getWorkloadTimeline: vi.fn(),
});

describe('createKubernetesDiagnosticsTools', () => {
  let driver: KubernetesDiagnosticsDriver;

  const getTool = (id: string) => {
    const tool = createKubernetesDiagnosticsTools({
      driver,
      logger: mockServices.logger.mock(),
    }).find(candidate => candidate.id === id);
    if (!tool) throw new Error(`Tool '${id}' was not registered`);
    return tool;
  };

  beforeEach(() => {
    driver = createDriver();
  });

  it('delegates entity workload resolution to the driver', async () => {
    await getTool('kubernetes.workload.resolve').invoke(
      { entityRef: 'component:default/checkout' },
      ctx,
    );
    expect(driver.resolveWorkloads).toHaveBeenCalledWith({
      entityRef: 'component:default/checkout',
    });
  });

  it('delegates bounded log reads to the driver', async () => {
    await getTool('kubernetes.pod.get_logs').invoke(
      {
        cluster: 'prod',
        namespace: 'checkout',
        pod: 'checkout-123',
        previous: true,
        tailLines: 100,
      },
      ctx,
    );
    expect(driver.getPodLogs).toHaveBeenCalledWith({
      cluster: 'prod',
      namespace: 'checkout',
      pod: 'checkout-123',
      previous: true,
      tailLines: 100,
    });
  });

  it('requires a bounded time range for timeline reads', async () => {
    await expect(
      getTool('kubernetes.workload.get_timeline').invoke(
        { entityRef: 'component:default/checkout' },
        ctx,
      ),
    ).rejects.toThrow(/'since' and 'until'/);
  });

  it('requires either entity identity or cluster and namespace for timeline reads', async () => {
    await expect(
      getTool('kubernetes.workload.get_timeline').invoke(
        { since: '2026-01-01T00:00:00.000Z', until: '2026-01-01T01:00:00.000Z' },
        ctx,
      ),
    ).rejects.toThrow(/Supply 'entityRef'/);
  });

  it('marks every diagnostics tool as read-only', () => {
    const tools = createKubernetesDiagnosticsTools({
      driver,
      logger: mockServices.logger.mock(),
    });
    expect(tools).toHaveLength(6);
    expect(tools.every(tool => tool.effect === 'read')).toBe(true);
  });
});
