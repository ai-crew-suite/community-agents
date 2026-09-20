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
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CloudProviderDriver } from '@ai-crew-suite/plugin-kernel-node';
import { createCloudProviderTools } from '../registerTools';

const createLogger = () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(),
});

describe('createCloudProviderTools', () => {
  let mockDriver: CloudProviderDriver;
  const logger = createLogger() as any;

  beforeEach(() => {
    mockDriver = {
      providerId: 'aws-test',
      lookupAccount: vi.fn(),
      lookupResource: vi.fn(),
      resourceDependencies: vi.fn(),
    };
  });

  it('should create exactly 3 specialized system tools mapping directly to driver capabilities', () => {
    const tools = createCloudProviderTools({ driver: mockDriver, logger });

    expect(tools).toHaveLength(3);

    expect(tools.map(tool => tool.id)).toEqual([
      'cloud.account.lookup',
      'cloud.resource.lookup',
      'cloud.resource.dependencies',
    ]);

    expect(tools.every(tool => tool.effect === 'read')).toBe(true);
  });

  it('should invoke lookupAccount safely inside the tool execute matrix closure block', async () => {
    const mockSummary = {
      id: '12345',
      provider: 'aws-test',
      name: 'dev-environment',
    };

    vi.mocked(mockDriver.lookupAccount).mockResolvedValueOnce(mockSummary);

    const tools = createCloudProviderTools({ driver: mockDriver, logger });
    const accountTool = tools.find(tool => tool.id === 'cloud.account.lookup');

    const result = await accountTool!.invoke(
      { accountId: '12345' },
      {} as never,
    );

    expect(mockDriver.lookupAccount).toHaveBeenCalledWith({
      accountId: '12345',
    });
    expect(result).toEqual(mockSummary);
  });
});
