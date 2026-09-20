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
import type {
  ArchitectureValidationResult,
  PolicyEvaluationResult
} from '@ai-crew-suite/plugin-kernel-node';
import type { EvidenceRef, PolicyViolation } from './state';

interface AdjudicateInput {
  policies: PolicyEvaluationResult[];
  architecture?: ArchitectureValidationResult;
  severity: Record<string, PolicyViolation['severity']>;
}

/** Folds compliance results into fail-closed, config-severity policy violations. */
export const adjudicate = (
  input: AdjudicateInput
): { violations: PolicyViolation[]; evidence: EvidenceRef[] } => {
  const violations: PolicyViolation[] = [];
  const evidence: EvidenceRef[] = [];

  for (const policy of input.policies) {
    let items = policy.violations ?? [];

    if (items.length === 0 && !policy.passed) {
      items = [{ rule: 'policy-denied', message: `Policy ${policy.policyId} denied the request` }];
    }

    for (const item of items) {
      const id = `pol-${violations.length + 1}`;
      evidence.push({ id, source: 'policy', summary: item.message, reference: item.rule });
      violations.push({
        id,
        policyId: policy.policyId,
        rule: item.rule,
        message: item.message,
        severity: input.severity[item.rule] ?? 'blocking',
        evidence: [id]
      });
    }
  }

  for (const item of input.architecture?.violations ?? []) {
    const id = `arch-${violations.length + 1}`;
    evidence.push({
      id,
      source: 'architecture',
      summary: item.message,
      reference: item.constraint
    });

    violations.push({
      id,
      rule: item.constraint,
      message: item.message,
      severity: input.severity[item.constraint] ?? 'blocking',
      evidence: [id]
    });
  }

  return { violations, evidence };
};
