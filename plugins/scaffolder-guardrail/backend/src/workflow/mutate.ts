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
import type { MutationProposal, PolicyViolation } from './state';

interface ProposeMutationInput {
  parameters: Record<string, unknown>;
  violations: PolicyViolation[];
  ladder: string[];
}

/** Chooses a safe instance type only from the configured environment ladder. */
export const proposeMutation = (input: ProposeMutationInput): MutationProposal[] => {
  const violation = input.violations.find(
    item => item.severity === 'negotiable' && /instance/i.test(item.parameter ?? item.rule)
  );

  const current = input.parameters.instanceType;
  if (!violation || typeof current !== 'string' || input.ladder.length === 0) return [];

  const position = input.ladder.indexOf(current);
  const target = input.ladder[input.ladder.length - 1];
  if (position === -1 || target === current) return [];

  return [{
    id: 'mut-1',
    parameter: 'instanceType',
    from: current,
    to: target,
    resolves: [violation.id],
    rationale: `Policy-derived alternative for ${violation.id}`
  }];
};
