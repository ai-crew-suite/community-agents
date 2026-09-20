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
  CommunicationDriver,
  ToolContext,
} from '@ai-crew-suite/plugin-kernel-node';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCommunicationTools } from '../registerTools';

const ctx: ToolContext = {
  logger: mockServices.logger.mock(),
  identity: 'user:default/tester',
  runId: 'run-1',
  signal: new AbortController().signal,
};

const createDriver = (): CommunicationDriver => ({
  providerId: 'test-chat',
  lookupChannel: vi.fn().mockResolvedValue({ id: 'C1', name: 'ops' }),
  postMessage: vi.fn().mockResolvedValue({ messageId: 'M1' }),
  getChannelHistory: vi.fn().mockResolvedValue([]),
});

describe('createCommunicationTools', () => {
  let driver: CommunicationDriver;

  const getTool = (id: string) => {
    const tool = createCommunicationTools({
      driver,
      logger: mockServices.logger.mock(),
    }).find(candidate => candidate.id === id);

    if (!tool) throw new Error(`Tool '${id}' was not registered`);
    return tool;
  };

  beforeEach(() => {
    driver = createDriver();
  });

  it('delegates channel lookup to the driver', async () => {
    await getTool('communication.channel.lookup').invoke(
      { teamOrService: 'checkout' },
      ctx,
    );

    expect(driver.lookupChannel).toHaveBeenCalledWith('checkout');
  });

  it('delegates channel history to the driver', async () => {
    await getTool('communication.channel.history').invoke({ channelId: 'C1' }, ctx);

    expect(driver.getChannelHistory).toHaveBeenCalledWith({ channelId: 'C1' });
  });

  it('delegates message posting to the driver', async () => {
    await getTool('communication.message.post').invoke(
      { channelId: 'C1', text: 'summary' },
      ctx,
    );

    expect(driver.postMessage).toHaveBeenCalledWith({
      channelId: 'C1',
      text: 'summary',
    });
  });

  it('rejects calls that omit required arguments', async () => {
    await expect(
      getTool('communication.channel.lookup').invoke({}, ctx),
    ).rejects.toThrow(/'teamOrService'/);
    await expect(
      getTool('communication.channel.history').invoke({}, ctx),
    ).rejects.toThrow(/'channelId'/);
    await expect(
      getTool('communication.message.post').invoke({ channelId: 'C1' }, ctx),
    ).rejects.toThrow(/'text'/);
  });

  it('marks read and write effects correctly', () => {
    expect(getTool('communication.channel.lookup').effect).toBe('read');
    expect(getTool('communication.channel.history').effect).toBe('read');
    expect(getTool('communication.message.post').effect).toBe('write');
  });
});
