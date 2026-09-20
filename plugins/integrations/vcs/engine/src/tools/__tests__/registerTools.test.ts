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
import { describe, expect, it, vi } from 'vitest';
import { createVcsTools } from '../registerTools';
import { VcsDriver } from '@ai-crew-suite/plugin-kernel-node';

const createMockDriver = (overrides: Partial<VcsDriver> = {}): VcsDriver => ({
  providerId: 'github',
  getRepositoryMetadata: vi
    .fn()
    .mockResolvedValue({ owner: 'webstackdev', name: 'ai-crew-suite', defaultBranch: 'main', provider: 'github', url: 'https://github.com/ai-crew-suite/ai-crew-suite' }),
  readFile: vi.fn().mockResolvedValue('file contents'),
  searchRepository: vi.fn().mockResolvedValue([]),
  listPullRequests: vi.fn().mockResolvedValue([]),
  ...overrides,
});

const createMockLogger = () => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn().mockReturnThis(),
});

const ctx = {
  logger: createMockLogger() as never,
  identity: 'test-user',
  runId: 'test-run',
  signal: new AbortController().signal,
};

describe('createVcsTools', () => {
  it('registers the expected stable tool IDs', () => {
    const tools = createVcsTools({
      driver: createMockDriver(),
      logger: createMockLogger() as never,
    });
    const ids = tools.map(t => t.id);
    expect(ids).toEqual([
      'vcs.repository.get_metadata',
      'vcs.repository.read_file',
      'vcs.repository.search',
      'vcs.pull_request.list',
    ]);
  });

  it('marks all first-pass tools as read-only', () => {
    const tools = createVcsTools({
      driver: createMockDriver(),
      logger: createMockLogger() as never,
    });
    for (const tool of tools) {
      expect(tool.effect).toBe('read');
    }
  });

  it('vcs.repository.read_file returns path, ref, and content', async () => {
    const driver = createMockDriver();
    const tools = createVcsTools({
      driver,
      logger: createMockLogger() as never,
    });
    const readFileTool = tools.find(t => t.id === 'vcs.repository.read_file');
    const result = await readFileTool!.invoke(
      { repoUrl: 'https://github.com/ai-crew-suite/ai-crew-suite', path: 'README.md', ref: 'main' },
      ctx,
    );
    expect(result).toEqual({
      path: 'README.md',
      ref: 'main',
      content: 'file contents',
    });
    expect(driver.readFile).toHaveBeenCalledWith(
      'https://github.com/ai-crew-suite/ai-crew-suite',
      'README.md',
      'main',
    );
  });

  it('vcs.repository.get_metadata returns driver metadata', async () => {
    const driver = createMockDriver();
    const tools = createVcsTools({
      driver,
      logger: createMockLogger() as never,
    });
    const tool = tools.find(t => t.id === 'vcs.repository.get_metadata');
    const result = await tool!.invoke(
      { repoUrl: 'https://github.com/ai-crew-suite/ai-crew-suite' },
      ctx,
    );
    expect(result).toMatchObject({
      owner: 'webstackdev',
      name: 'ai-crew-suite',
      provider: 'github',
    });
  });
});
