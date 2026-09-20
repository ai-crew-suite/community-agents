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
import { mkdtemp, readFile, rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { writeWorkspaceFiles } from '../workspaceWriter';

describe('writeWorkspaceFiles', () => {
  it('writes validated files inside the workspace and honors dry-run', async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), 'infra-'));

    try {
      const dry = await writeWorkspaceFiles({
        workspacePath: workspace,
        outputDir: '.',
        files: [{ path: 'main.tf', dialect: 'hcl', content: 'ok' }],
        allowOverwrite: false,
        dryRun: true
      });
      expect(dry).toEqual(['main.tf']);

      await writeWorkspaceFiles({
        workspacePath: workspace,
        outputDir: '.',
        files: [{ path: 'main.tf', dialect: 'hcl', content: 'ok' }],
        allowOverwrite: false,
        dryRun: false
      });
      expect(await readFile(path.join(workspace, 'main.tf'), 'utf8')).toBe('ok');
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it('rejects output traversal', async () => {
    await expect(
      writeWorkspaceFiles({
        workspacePath: '/tmp/workspace',
        outputDir: '../escape',
        files: [],
        allowOverwrite: false,
        dryRun: true
      })
    ).rejects.toThrow(/escapes/);
  });
});
