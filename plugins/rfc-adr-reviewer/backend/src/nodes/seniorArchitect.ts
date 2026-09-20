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
import type { ReviewToolRunner } from '../services/ReviewToolRunner';
import type { ReviewEvidence, ReviewFinding, ReviewRequest } from '../workflow/state';

/**
 * Runs the senior architecture review channel against retrieved standards and referenced document entities.
 * Pulls relevant governance logs via knowledge base queries to verify compatibility constraints.
 *
 * @param input - Evaluation dependencies payload context.
 * @param input.request - The original repository target criteria request.
 * @param input.document - The sliced and redacted design specification file content.
 * @param input.references - Deduplicated platform resource entity keys parsed from the text.
 * @param input.tools - Bounded workflow tool calling manager utility.
 * @returns A Promise resolving to paired evidence arrays and structured critique findings.
 */
export const reviewArchitecture = async (input: {
  request: ReviewRequest;
  document: string;
  references: string[];
  tools: ReviewToolRunner;
}): Promise<{ evidence: ReviewEvidence[]; findings: ReviewFinding[] }> => {
  const evidence: ReviewEvidence[] = [];
  const findings: ReviewFinding[] = [];

  const standards = await input.tools.invoke<
    { query: string; source: string },
    { content?: string; metadata?: { url?: string } }[]
  >('knowledge.retrieve', {
    query: `Architecture standards for ${input.request.path}: ${input.references.join(', ')}`,
    source: 'catalog',
  });

  const standardItems = standards?.output ?? [];

  for (const [index, item] of standardItems.slice(0, 3).entries()) {
    evidence.push({
      id: `arch-knowledge-${index + 1}`,
      source: 'knowledge',
      summary: item.content ?? 'Architecture standard',
      reference: item.metadata?.url,
    });
  }

  if (/\bdeprecated\b/i.test(input.document)) {
    findings.push({
      id: 'arch-1',
      channel: 'senior-architect',
      severity: 'high',
      summary: 'The document references a deprecated architecture element; provide a supported migration path.',
      citations: ['document-1', ...evidence.slice(0, 1).map((item) => item.id)],
    });
  }

  return { evidence, findings };
};
