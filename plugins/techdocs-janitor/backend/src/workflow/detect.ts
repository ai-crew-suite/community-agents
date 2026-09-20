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
import type { JanitorDiscrepancy } from './state';

/** Detects documented owner drift and classifies relative/external markdown links without probing hosts. */
export const detectMarkdown = (input: {
  path: string;
  content: string;
  owner?: string;
}): JanitorDiscrepancy[] => {
  const lines = input.content.split(/\r?\n/);
  const findings: JanitorDiscrepancy[] = [];

  lines.forEach((line, index) => {
    const range = {
      path: input.path,
      startLine: index + 1,
      endLine: index + 1,
      excerpt: line.slice(0, 500),
    };

    const owner = /(?:owner|team)\s*:\s*([\w:-]+)/i.exec(line);

    if (owner && input.owner && owner[1] !== input.owner)
      findings.push({
        id: `disc-${findings.length + 1}`,
        kind: 'ownership_drift',
        severity: 'high',
        message: `Documented owner ${owner[1]} differs from catalog owner ${input.owner}.`,
        range,
        replacement: input.owner,
        evidence: ['cat-1'],
      });

    const link = /\[[^\]]+\]\(([^)]+)\)/.exec(line);

    if (link && /^\.\.?\//.test(link[1]))
      findings.push({
        id: `disc-${findings.length + 1}`,
        kind: 'dead_relative_link',
        severity: 'medium',
        message: `Relative link ${link[1]} requires target verification.`,
        range,
        evidence: [],
      });

    if (link && /^https?:\/\//.test(link[1]))
      findings.push({
        id: `disc-${findings.length + 1}`,
        kind: 'unverified_external_link',
        severity: 'low',
        message: `External link ${link[1]} is unverified; no arbitrary host probe was performed.`,
        range,
        evidence: [],
      });
  });

  return findings;
};
