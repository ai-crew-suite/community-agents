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
import { locateYamlBlocks } from './locateYaml';
import { locateHclBlocks } from './locateHcl';

// Defining LocateResult locally to exactly match its consumption target signature block
export type LocateFailure =
  | 'no_match'
  | 'ambiguous_match'
  | 'no_tunable_field';

export type LocateResult =
  | { ok: true; anchor: any; reason?: undefined }
  | { ok: false; reason: LocateFailure; matches: number };

/**
 * Coordinates infrastructure tracking logic. Automatically switches engine implementations
 * between pure-JS YAML parsers and compiled WebAssembly Tree-Sitter nodes.
 */
export async function locateThresholdAnchor(input: {
  path: string;
  content: string;
  alertName: string;
}): Promise<LocateResult> {
  const isYaml = input.path.endsWith('.yaml') || input.path.endsWith('.yml');

  try {
    const outcome = isYaml
      ? locateYamlBlocks(input.content, input.alertName)
      : await locateHclBlocks(input.content, input.alertName);

    if (!outcome) {
      return { ok: false, reason: 'no_match', matches: 0 };
    }

    if (!outcome.currentThreshold && !outcome.currentDuration) {
      return { ok: false, reason: 'no_tunable_field', matches: 1 };
    }

    return {
      ok: true,
      anchor: {
        path: input.path,
        blockName: outcome.blockName,
        currentThreshold: outcome.currentThreshold,
        currentDuration: outcome.currentDuration,
        evidence: ['iac-1'],
      },
    };
  } catch (error) {
    return { ok: false, reason: 'no_match', matches: 0 };
  }
}
