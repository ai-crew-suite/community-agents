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
  ProjectManagementDriver,
  ToolContext,
} from '@ai-crew-suite/plugin-kernel-node';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createProjectManagementTools } from '../registerTools';

const ctx: ToolContext = {
  logger: mockServices.logger.mock(),
  identity: 'user:default/tester',
  runId: 'run-1',
  signal: new AbortController().signal,
};

const createDriver = (): ProjectManagementDriver => ({
  providerId: 'test-tickets',
  searchTickets: vi.fn().mockResolvedValue([]),
  getTicket: vi.fn().mockResolvedValue({ id: 'T-1', title: 'x', state: 'open' }),
  createTicket: vi.fn().mockResolvedValue({ id: 'T-2', title: 'y', state: 'open' }),
  commentTicket: vi.fn().mockResolvedValue({ author: { id: 'bot' }, body: 'c' }),
});

describe('createProjectManagementTools', () => {
  let driver: ProjectManagementDriver;

  const getTool = (id: string) => {
    const tool = createProjectManagementTools({
      driver,
      logger: mockServices.logger.mock(),
    }).find(candidate => candidate.id === id);

    if (!tool) throw new Error(`Tool '${id}' was not registered`);
    return tool;
  };

  beforeEach(() => {
    driver = createDriver();
  });

  it('delegates ticket search to the driver', async () => {
    await getTool('project.ticket.search').invoke({ text: 'outage', limit: 5 }, ctx);

    expect(driver.searchTickets).toHaveBeenCalledWith({ text: 'outage', limit: 5 });
  });

  it('delegates ticket lookup to the driver', async () => {
    await getTool('project.ticket.get').invoke({ ticketId: 'OPS-1' }, ctx);

    expect(driver.getTicket).toHaveBeenCalledWith('OPS-1');
  });

  it('delegates ticket creation to the driver', async () => {
    await getTool('project.ticket.create').invoke({ title: 'Fix checkout' }, ctx);

    expect(driver.createTicket).toHaveBeenCalledWith({ title: 'Fix checkout' });
  });

  it('rejects calls that omit required arguments', async () => {
    await expect(getTool('project.ticket.get').invoke({}, ctx)).rejects.toThrow(
      /'ticketId'/,
    );
    await expect(getTool('project.ticket.create').invoke({}, ctx)).rejects.toThrow(
      /'title'/,
    );
    await expect(
      getTool('project.ticket.comment').invoke({ ticketId: 'OPS-1' }, ctx),
    ).rejects.toThrow(/'comment'/);
  });

  it('marks read and write effects correctly', () => {
    expect(getTool('project.ticket.search').effect).toBe('read');
    expect(getTool('project.ticket.get').effect).toBe('read');
    expect(getTool('project.ticket.create').effect).toBe('write');
    expect(getTool('project.ticket.comment').effect).toBe('write');
  });
});
