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
import type { ArchitectureValidationResult, PolicyEvaluationResult } from '@ai-crew-suite/plugin-kernel-node';
import type { ReviewToolRunner } from '../services/ReviewToolRunner';
import type { ReviewEvidence, ReviewFinding, ReviewRequest } from '../workflow/state';

/**
 * Runs the security review channel through specialized compliance architecture and policy validation tools.
 * Evaluates raw document inputs concurrently against active enterprise regulatory parameters.
 *
 * @param input - Evaluation dependencies payload context.
 * @param input.request - The original repository target criteria request.
 * @param input.document - The sliced and redacted design specification file content.
 * @param input.tools - Bounded workflow tool calling manager utility.
 * @returns A Promise resolving to paired compliance evidence tracking records and severity findings.
 */
export const reviewSecurity = async (input: {
  request: ReviewRequest;
  document: string;
  tools: ReviewToolRunner;
}): Promise<{ evidence: ReviewEvidence[]; findings: ReviewFinding[] }> => {
  const evidence: ReviewEvidence[] = [];
  const findings: ReviewFinding[] = [];

  const [architecture, policy] = await Promise.all([
    input.tools.invoke<{ proposal: string }, ArchitectureValidationResult>(
      'compliance.architecture.validate',
      { proposal: input.document }
    ),
    input.tools.invoke<{ input: string }, PolicyEvaluationResult>(
      'compliance.policy.evaluate',
      { input: input.document }
    ),
  ]);

  const architectureViolations = architecture?.output.violations ?? [];
  for (const violation of architectureViolations) {
    const id = `security-architecture-${evidence.length + 1}`;

    evidence.push({
      id,
      source: 'compliance',
      summary: violation.message,
    });

    findings.push({
      id: `security-finding-${findings.length + 1}`,
      channel: 'security-lead',
      severity: 'high',
      summary: violation.message,
      citations: ['document-1', id],
    });
  }

  const policyViolations = policy?.output.violations ?? [];
  for (const violation of policyViolations) {
    const id = `security-policy-${evidence.length + 1}`;

    evidence.push({
      id,
      source: 'compliance',
      summary: violation.message,
    });

    findings.push({
      id: `security-finding-${findings.length + 1}`,
      channel: 'security-lead',
      severity: violation.severity === 'critical' ? 'critical' : 'high',
      summary: violation.message,
      citations: ['document-1', id],
    });
  }

  return { evidence, findings };
};
