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
  IncidentManagementDriver,
  ToolContext,
} from '@ai-crew-suite/plugin-kernel-node';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createIncidentManagementTools } from '../registerTools';

const ctx: ToolContext = {
  logger: mockServices.logger.mock(),
  identity: 'user:default/tester',
  runId: 'run-1',
  signal: new AbortController().signal,
};

const createDriver = (): IncidentManagementDriver => ({
  providerId: 'test-incidents',
  listIncidents: vi.fn().mockResolvedValue([]),
  getIncident: vi
    .fn()
    .mockResolvedValue({ id: 'INC-1', title: 'x', state: 'triggered' }),
  getOnCallShifts: vi.fn().mockResolvedValue([]),
  getAlertHistory: vi.fn().mockResolvedValue([]),
  annotateIncident: vi
    .fn()
    .mockResolvedValue({ author: { id: 'bot' }, body: 'note' }),
});

describe('createIncidentManagementTools', () => {
  let driver: IncidentManagementDriver;

  const getTool = (id: string) => {
    const tool = createIncidentManagementTools({
      driver,
      logger: mockServices.logger.mock(),
    }).find(candidate => candidate.id === id);

    if (!tool) throw new Error(`Tool '${id}' was not registered`);
    return tool;
  };

  beforeEach(() => {
    driver = createDriver();
  });

  it('delegates incident listing to the driver', async () => {
    await getTool('incident.incident.list').invoke(
      { service: 'checkout', states: ['triggered'] },
      ctx,
    );

    expect(driver.listIncidents).toHaveBeenCalledWith({
      service: 'checkout',
      states: ['triggered'],
    });
  });

  it('delegates on-call resolution to the driver', async () => {
    await getTool('incident.oncall.get').invoke({ team: 'payments' }, ctx);

    expect(driver.getOnCallShifts).toHaveBeenCalledWith({ team: 'payments' });
  });

  it('delegates alert history to the driver', async () => {
    await getTool('incident.alert.history').invoke(
      { service: 'checkout', since: '2026-01-01T00:00:00.000Z' },
      ctx,
    );

    expect(driver.getAlertHistory).toHaveBeenCalledWith({
      service: 'checkout',
      since: '2026-01-01T00:00:00.000Z',
    });
  });

  it('delegates annotation to the driver', async () => {
    await getTool('incident.incident.annotate').invoke(
      { incidentId: 'INC-1', note: 'run link' },
      ctx,
    );

    expect(driver.annotateIncident).toHaveBeenCalledWith('INC-1', 'run link');
  });

  it('rejects calls that omit required arguments', async () => {
    await expect(
      getTool('incident.incident.get').invoke({}, ctx),
    ).rejects.toThrow(/'incidentId'/);
    await expect(
      getTool('incident.incident.annotate').invoke({ incidentId: 'INC-1' }, ctx),
    ).rejects.toThrow(/'note'/);
  });

  it('marks read and write effects correctly', () => {
    expect(getTool('incident.incident.list').effect).toBe('read');
    expect(getTool('incident.oncall.get').effect).toBe('read');
    expect(getTool('incident.alert.history').effect).toBe('read');
    expect(getTool('incident.incident.annotate').effect).toBe('write');
  });
});
