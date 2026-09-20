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
import { promises as fs } from 'fs';
import path from 'path';
import type { GeneratedFile } from '../workflow/state';

interface WriteWorkspaceFilesInput {
  workspacePath: string;
  outputDir: string;
  files: GeneratedFile[];
  allowOverwrite: boolean;
  dryRun: boolean;
}

/** Writes validated generation files only under the Scaffolder workspace root. */
export const writeWorkspaceFiles = async (
  input: WriteWorkspaceFilesInput
): Promise<string[]> => {
  const root = path.resolve(input.workspacePath);
  const target = path.resolve(root, input.outputDir);

  if (!target.startsWith(`${root}${path.sep}`) && target !== root) {
    throw new Error('Output directory escapes the Scaffolder workspace');
  }

  const destinations = input.files.map(file => ({
    file,
    path: path.resolve(target, file.path)
  }));

  if (destinations.some(item => !item.path.startsWith(`${root}${path.sep}`))) {
    throw new Error('Generated file path escapes the Scaffolder workspace');
  }

  if (input.dryRun) {
    return destinations.map(item => path.relative(root, item.path));
  }

  for (const item of destinations) {
    await fs.mkdir(path.dirname(item.path), { recursive: true });

    if (!input.allowOverwrite) {
      try {
        await fs.access(item.path);
        throw new Error(`Refusing to overwrite existing workspace file '${item.file.path}'`);
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('Refusing')) {
          throw error;
        }
      }
    }
  }

  for (const item of destinations) {
    await fs.writeFile(item.path, item.file.content, 'utf8');
  }

  return destinations.map(item => path.relative(root, item.path));
};
