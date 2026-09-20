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

const secretPattern =
  /\b(api[_-]?key|password|secret|token)\b\s*[:=]\s*(['"]?)([^'"\s]{8,})\2/i;

/** Detects secret-shaped literals and retains only their pattern class, never their value. */
export const secretFromSnippet = (input: {
  id: string;
  repoUrl: string;
  path: string;
  line?: number;
  snippet?: string;
}): DebtSignal | undefined => {
  const snippet = input.snippet?.slice(0, 512) ?? '';
  const match = secretPattern.exec(snippet);
  if (!match) return undefined;
  return {
    id: input.id,
    kind: 'secret_literal',
    repoUrl: input.repoUrl,
    path: input.path,
    line: input.line,
    raw: `[REDACTED ${match[1].toUpperCase()} LITERAL]`,
    evidence: [input.id],
  };
};
