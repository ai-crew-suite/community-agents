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
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  registerWeeklySweep,
  ALERT_AI_TUNER_SWEEP_TASK_ID,
} from '../weeklySweep';
import type { AlertAiTunerConfig } from '../../config';
import type {
  SchedulerService,
  DiscoveryService,
  AuthService,
  LoggerService,
} from '@backstage/backend-plugin-api';

const globalFetchMock = vi.fn();
vi.stubGlobal('fetch', globalFetchMock);

describe('weeklySweep Scheduling Engine Layer', () => {
  let deps: {
    scheduler: SchedulerService;
    discovery: DiscoveryService;
    auth: AuthService;
    logger: LoggerService;
    config: AlertAiTunerConfig;
  };
  let scheduledFn: Function;

  beforeEach(() => {
    vi.clearAllMocks();
    scheduledFn = () => {};

    // Mock Backstage scheduleTask wrapper to capture the task function pointer context
    const scheduleTask = vi.fn(({ fn }) => {
      scheduledFn = fn;
      return Promise.resolve();
    });

    deps = {
      scheduler: { scheduleTask } as unknown as SchedulerService,
      discovery: { getBaseUrl: vi.fn().mockResolvedValue('https://backstage.internal') } as unknown as DiscoveryService,
      auth: {
        getOwnServiceCredentials: vi.fn().mockResolvedValue({ token: 'own-creds' }),
        getPluginRequestToken: vi.fn().mockResolvedValue({ token: 'mock-auth-bearer' }),
      } as unknown as AuthService,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as LoggerService,
      config: {
        windowDays: 14,
        sweep: {
          cron: '0 6 * * 1',
          services: ['auth-service', 'payment-service'],
          maxSweepAlerts: 10,
          cooldownDays: 30,
        },
      } as unknown as AlertAiTunerConfig,
    };
  });

  it('registers the background task correctly into Backstage framework lifecycles', () => {
    registerWeeklySweep(deps);

    expect(deps.scheduler.scheduleTask).toHaveBeenCalledWith(
      expect.objectContaining({
        id: ALERT_AI_TUNER_SWEEP_TASK_ID,
        frequency: { cron: '0 6 * * 1' },
        scope: 'global',
      })
    );
  });

  it('sequentially delivers authenticated HTTP dispatches for all planned sweep items', async () => {
    globalFetchMock.mockResolvedValue({ ok: true, status: 202 });
    registerWeeklySweep(deps);

    // Execute the underlying scheduler callback function
    await scheduledFn();

    expect(deps.discovery.getBaseUrl).toHaveBeenCalledWith('ai-core');
    expect(deps.auth.getPluginRequestToken).toHaveBeenCalled();

    // Expect 2 fetch dispatches mapped directly to configuration dependencies matching our inventory
    expect(globalFetchMock).toHaveBeenCalledTimes(2);
    expect(globalFetchMock).toHaveBeenNthCalledWith(
      1,
      'https://backstage.internal/agents/alert-ai-tuner/runs',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer ' + 'mock-auth-bearer',
        },
      })
    );
  });

  it('acts as an inner fault-isolator and continues the loop if an individual dispatch is rejected', async () => {
    // First service throws a 500 rejection, second service passes cleanly
    globalFetchMock
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: true, status: 200 });

    registerWeeklySweep(deps);
    await scheduledFn();

    // Verify it recorded a warning to the logs for the broken service but proceeded down the loop anyway
    expect(globalFetchMock).toHaveBeenCalledTimes(2);
    expect(deps.logger.warn).toHaveBeenCalledWith(
      'Alert tuning sweep dispatch was rejected',
      expect.objectContaining({ status: 500, service: 'auth-service' })
    );
  });

  it('enforces a strict internal concurrency mutex guard to reject multiple active overlapping executions', async () => {
    let resolveFirstFetch: Function = () => {};
    const fetchBlockPromise = new Promise((resolve) => {
      resolveFirstFetch = resolve;
    });

    globalFetchMock.mockReturnValue(fetchBlockPromise);
    registerWeeklySweep(deps);

    // Trigger the initial baseline pass - this will pause waiting for fetch block promise resolution
    const firstTaskRun = scheduledFn();

    // While first task run is active and blocked inside the flight path loop, execute a secondary trigger click
    await scheduledFn();

    expect(deps.logger.info).toHaveBeenCalledWith(
      'Alert tuning sweep skipped: a previous sweep is still running'
    );

    // Unblock the initial promise loop to exit out cleanly
    resolveFirstFetch({ ok: true, status: 200 });
    await firstTaskRun;
  });
});
