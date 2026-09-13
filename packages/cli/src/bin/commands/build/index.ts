/**
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
import { Command } from 'commander';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const program = new Command();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

program
  .description('Compile workspace distributions using the Backstage compiler runtime')
  .allowUnknownOption(true)
  .action(() => {
    const mainCliPath = path.resolve(__dirname, '../../crew.js');

    console.log('\x1b[34m⎋ Triggering pre-build clean cycle...\x1b[0m');

    const cleanResult = spawnSync('node', [mainCliPath, 'clean'], {
      stdio: 'inherit',
      shell: true,
      cwd: process.cwd(),
    });

    if (cleanResult.status !== 0) {
      process.exit(cleanResult.status ?? 1);
    }
    const syncResult = spawnSync('node', [mainCliPath, 'sync:refs'], {
      stdio: 'inherit',
      shell: true,
      cwd: process.cwd(),
    });

    if (syncResult.status !== 0) {
      process.exit(syncResult.status ?? 1);
    }

    console.log('\x1b[35m┌────────────────────────────────────────────────────────┐\x1b[0m');
    console.log('\x1b[35m│ 🚀 AI CREW SUITE: Orchestrating Backstage Build Target │\x1b[0m');
    console.log('\x1b[35m└────────────────────────────────────────────────────────┘\x1b[0m');
    console.log(`\x1b[35m\x1b[90mContext:\x1b[0m ${process.cwd()}`);

    const forwardedArgs = process.argv.slice(3);
    const typescriptPackageJson = require.resolve('typescript/package.json');
    const typescriptCliPath = path.resolve(
      path.dirname(typescriptPackageJson),
      'bin/tsc',
    );
    const declarationCleanResult = spawnSync(
      process.execPath,
      [typescriptCliPath, '--build', '--clean'],
      {
        stdio: 'inherit',
        shell: true,
        cwd: process.cwd(),
      },
    );

    if (declarationCleanResult.status !== 0) {
      process.exit(declarationCleanResult.status ?? 1);
    }

    const declarationResult = spawnSync(
      process.execPath,
      [typescriptCliPath, '--build', '--force', '--emitDeclarationOnly'],
      {
        stdio: 'inherit',
        shell: true,
        cwd: process.cwd(),
      },
    );

    if (declarationResult.status !== 0) {
      process.exit(declarationResult.status ?? 1);
    }

    const backstagePackageJson = require.resolve('@backstage/cli/package.json');
    const backstageCliPath = path.resolve(
      path.dirname(backstagePackageJson),
      'bin/backstage-cli',
    );
    const buildResult = spawnSync(
      process.execPath,
      [backstageCliPath, 'package', 'build', ...forwardedArgs],
      {
        stdio: 'inherit',
        shell: true,
        cwd: process.cwd(),
      }
    );

    process.exit(buildResult.status ?? 0);
  });

program.parse(process.argv);
