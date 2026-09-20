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
import type { DebtSignal } from '../workflow/state';

/** Extracts one supported marker tag and optional parenthesized scope from a search snippet. */
export const markerFromSnippet = (input: {
  id: string;
  repoUrl: string;
  path: string;
  line?: number;
  snippet?: string;
}): DebtSignal | undefined => {
  const snippet = input.snippet?.slice(0, 512) ?? '';
  const match = /\b(TODO|FIXME|HACK|XXX)(?:\(([^)]+)\))?\s*:?(.*)/i.exec(
    snippet,
  );

  if (!match) return undefined;

  return {
    id: input.id,
    kind: 'marker',
    repoUrl: input.repoUrl,
    path: input.path,
    line: input.line,
    raw: snippet,
    markerTag: match[1].toUpperCase() as DebtSignal['markerTag'],
    markerScope: match[2]?.trim().toLowerCase(),
    evidence: [input.id],
  };
};
