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
import fs from 'node:fs';
import path from 'node:path';
import { getWorkspaceContext } from '../../../utils/workspace.js';

export interface PackageJson {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  [key: string]: unknown;
}

export interface PackageInfo {
  name: string;
  dirPath: string;
  relativeFromRoot: string;
  pkgJson: PackageJson;
}

export interface TsConfigReference {
  path: string;
}

export interface TsConfig {
  references?: TsConfigReference[];
  [key: string]: unknown; // 💡 FIXED: Enforced type safety
}

/**
 * Strips comments safely for strict JSON parsing
 */
export function parseCommentedJson<T = Record<string, unknown>>(jsonString: string): T {
  const cleanJson = jsonString
    .replace(/\/\*[\s\S]*?\*\//g, '') // Strip block comments /* ... */ safely
    .replace(/^(?:[^"\n]|"[^"\n]*")*?(\/\/.*)$/gm, (match, group1) => {
      return match.replace(group1, '');
    })
    .replace(/,\s*([}\]])/g, '$1'); // Accept JSONC trailing commas
  return JSON.parse(cleanJson) as T;
}

/**
 * Recursively locates leaf packages containing package.json
 */
export function findPackages(
  dir: string,
  repoRoot: string,
  packageMaps = new Map<string, PackageInfo>()
): Map<string, PackageInfo> {
  if (!fs.existsSync(dir)) return packageMaps;
  const files = fs.readdirSync(dir);

  if (files.includes('package.json')) {
    try {
      const pkgJsonPath = path.join(dir, 'package.json');
      const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8')) as PackageJson;
      if (pkgJson.name) {
        packageMaps.set(pkgJson.name, {
          name: pkgJson.name,
          dirPath: dir,
          relativeFromRoot: path.relative(repoRoot, dir).replace(/\\/g, '/'),
          pkgJson
        });
      }
    } catch {
      console.error(`Failed parsing package.json in ${dir}`);
    }
    return packageMaps;
  }

  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory() && !file.startsWith('.') && file !== 'node_modules' && file !== 'dist') {
      findPackages(fullPath, repoRoot, packageMaps);
    }
  }
  return packageMaps;
}

/**
 * Iterates through all internal packages to align child-level references and root map targets
 */
export function syncProjectReferences(): void {
  // 💡 FIXED: Read the absolute repo root path dynamically using your shared workspace context
  const context = getWorkspaceContext();
  const repoRoot = context.repoRoot;

  const allPackages = new Map<string, PackageInfo>();

  findPackages(path.join(repoRoot, 'packages'), repoRoot, allPackages);
  findPackages(path.join(repoRoot, 'apps'), repoRoot, allPackages);
  findPackages(path.join(repoRoot, 'plugins'), repoRoot, allPackages);

  console.log(`Analyzing internal dependency graphs for ${allPackages.size} packages...`);

  allPackages.forEach((pkgInfo) => {
    const tsconfigPath = path.join(pkgInfo.dirPath, 'tsconfig.json');
    if (!fs.existsSync(tsconfigPath)) return;

    // TypeScript project references should follow package edges, not tooling
    // dependencies such as the repository CLI used by package scripts.
    const deps = {
      ...pkgInfo.pkgJson.dependencies,
      ...pkgInfo.pkgJson.peerDependencies,
    };

    const tsconfigReferences: TsConfigReference[] = [];

    Object.keys(deps).forEach((depName) => {
      if (allPackages.has(depName)) {
        const targetPkg = allPackages.get(depName)!;
        let relativePath = path.relative(pkgInfo.dirPath, targetPkg.dirPath).replace(/\\/g, '/');

        if (!relativePath.startsWith('.')) {
          relativePath = `./${relativePath}`;
        }

        tsconfigReferences.push({ path: relativePath });
      }
    });

    tsconfigReferences.sort((a, b) => a.path.localeCompare(b.path));

    try {
      const tsconfigRaw = fs.readFileSync(tsconfigPath, 'utf8');
      const tsconfigData = parseCommentedJson<TsConfig>(tsconfigRaw);

      const existingRefsStr = JSON.stringify(tsconfigData.references || []);
      const newRefsStr = JSON.stringify(tsconfigReferences);

      if (existingRefsStr !== newRefsStr) {
        tsconfigData.references = tsconfigReferences;
        fs.writeFileSync(tsconfigPath, JSON.stringify(tsconfigData, null, 2), 'utf8');
        console.log(`✅ Synced references for: ${pkgInfo.relativeFromRoot}`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`❌ Error writing tsconfig for ${pkgInfo.relativeFromRoot}:`, message);
    }
  });

  const ROOT_TSCONFIG_PATH = path.join(repoRoot, 'tsconfig.json');

  if (fs.existsSync(ROOT_TSCONFIG_PATH)) {
    try {
      const rootRaw = fs.readFileSync(ROOT_TSCONFIG_PATH, 'utf8');
      const rootData = parseCommentedJson<TsConfig>(rootRaw);

      const rootReferences: TsConfigReference[] = Array.from(allPackages.values())
        .map(pkg => ({ path: `./${pkg.relativeFromRoot}` }))
        .sort((a, b) => a.path.localeCompare(b.path));

      rootData.references = rootReferences;

      fs.writeFileSync(ROOT_TSCONFIG_PATH, JSON.stringify(rootData, null, 2), 'utf8');
      console.log(`✨ Automatically healed root tsconfig.json with ${rootReferences.length} paths!`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('❌ Failed to auto-update root tsconfig.json:', message);
    }
  }
}
