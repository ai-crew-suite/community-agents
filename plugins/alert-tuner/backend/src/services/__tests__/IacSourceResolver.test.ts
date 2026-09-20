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
import {
  IacSourceResolver,
  VCS_METADATA_TOOL_ID,
  VCS_SEARCH_TOOL_ID,
  VCS_READ_FILE_TOOL_ID
} from '../IacSourceResolver';
import type { TunerToolRunner } from '../TunerToolRunner';

const createMockToolRunner = (implementations: Record<string, Function>) => {
  const invoke = vi.fn(async (toolId: string, args: any) => {
    if (toolId in implementations) {
      return implementations[toolId](args);
    }
    throw new Error(`Tool ${toolId} not mocked`);
  });

  return {
    tools: { invoke } as unknown as TunerToolRunner,
    invoke,
  };
};

describe('IacSourceResolver Sub-Suite', () => {
  const defaultRepo = 'https://github.com';
  const defaultAlert = 'cpu_high';

  it('resolves directly with explicit path parameter bypassing search execution loops', async () => {
    const { tools, invoke } = createMockToolRunner({
      [VCS_METADATA_TOOL_ID]: () => ({ output: { defaultBranch: 'main' } }),
      [VCS_READ_FILE_TOOL_ID]: () => ({ output: { content: 'alert_content_here' } }),
    });

    const resolver = new IacSourceResolver(tools, ['fallback.tf'], 100);
    const result = await resolver.resolve({
      repoUrl: defaultRepo,
      iacPath: 'explicit/path.tf',
      alertName: defaultAlert,
    });

    expect(result).toEqual({
      repoUrl: defaultRepo,
      path: 'explicit/path.tf',
      content: 'alert_content_here',
      baseBranch: 'main',
    });
    expect(invoke).toHaveBeenCalledWith(VCS_READ_FILE_TOOL_ID, { repoUrl: defaultRepo, path: 'explicit/path.tf' });
    expect(invoke).not.toHaveBeenCalledWith(VCS_SEARCH_TOOL_ID, expect.any(Object));
  });

  it('safely intersects wildcard glob search paths while dropping unauthorized hits', async () => {
    const { tools } = createMockToolRunner({
      [VCS_METADATA_TOOL_ID]: () => ({ output: { defaultBranch: 'develop' } }),
      [VCS_SEARCH_TOOL_ID]: () => ({
        output: [
          { path: 'alerts/approved-cpu.tf' },       // Matches glob: alerts/*
          { path: 'malicious/hijack-alert.tf' },    // Disallowed!
          { path: 'exact-match.tf' },               // Matches exact candidate
        ],
      }),
      [VCS_READ_FILE_TOOL_ID]: ({ path }: { path: string }) => {
        if (path === 'alerts/approved-cpu.tf') return { output: { content: 'valid_hcl_block' } };
        return { output: undefined };
      },
    });

    // Allowed candidates include a wildcard prefix and an exact fallback file path
    const candidatePaths = ['alerts/*', 'exact-match.tf'];
    const resolver = new IacSourceResolver(tools, candidatePaths, 1000);

    const result = await resolver.resolve({
      repoUrl: defaultRepo,
      alertName: defaultAlert,
    });

    expect(result).toBeDefined();
    expect(result?.path).toBe('alerts/approved-cpu.tf');
    expect(result?.content).toBe('valid_hcl_block');
    expect(result?.baseBranch).toBe('develop');
  });

  it('falls back sequentially through non-glob configured candidates if search outputs no allowed matches', async () => {
    const { tools } = createMockToolRunner({
      [VCS_METADATA_TOOL_ID]: () => ({ output: undefined }),
      [VCS_SEARCH_TOOL_ID]: () => ({ output: [] }), // Search yields zero hits
      [VCS_READ_FILE_TOOL_ID]: ({ path }: { path: string }) => {
        if (path === 'fallback-2.tf') return { output: { content: 'fallback_content' } };
        return { output: undefined }; // fallback-1.tf doesn't exist
      },
    });

    const candidatePaths = ['fallback-1.tf', 'fallback-2.tf', 'wildcard/*'];
    const resolver = new IacSourceResolver(tools, candidatePaths, 500);

    const result = await resolver.resolve({
      repoUrl: defaultRepo,
      alertName: defaultAlert,
    });

    expect(result).toEqual({
      repoUrl: defaultRepo,
      path: 'fallback-2.tf',
      content: 'fallback_content',
      baseBranch: undefined, // Gracefully handles missing branch metadata field values
    });
  });

  it('enforces hard character truncation limits on massive codebase file payloads', async () => {
    const massiveContent = 'A'.repeat(50);
    const { tools } = createMockToolRunner({
      [VCS_METADATA_TOOL_ID]: () => ({ output: {} }),
      [VCS_READ_FILE_TOOL_ID]: () => ({ output: { content: massiveContent } }),
    });

    const maxChars = 10;
    const resolver = new IacSourceResolver(tools, ['exact.tf'], maxChars);

    const result = await resolver.resolve({
      repoUrl: defaultRepo,
      iacPath: 'exact.tf',
      alertName: defaultAlert,
    });

    expect(result?.content).toHaveLength(10);
    expect(result?.content).toBe('A'.repeat(10));
  });

  it('returns undefined cleanly if files are missing or unreadable across all candidate tracks', async () => {
    const { tools } = createMockToolRunner({
      [VCS_METADATA_TOOL_ID]: () => ({ output: {} }),
      [VCS_SEARCH_TOOL_ID]: () => ({ output: null }),
      [VCS_READ_FILE_TOOL_ID]: () => ({ output: { content: null } }), // Unreadable file context data
    });

    const resolver = new IacSourceResolver(tools, ['empty.tf'], 100);
    const result = await resolver.resolve({
      repoUrl: defaultRepo,
      alertName: defaultAlert,
    });

    expect(result).toBeUndefined();
  });
});
