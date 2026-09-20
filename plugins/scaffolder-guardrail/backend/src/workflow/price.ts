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
import type { CostEstimateResult } from '@ai-crew-suite/plugin-kernel-node';
import type { BudgetVerdict, EvidenceRef } from './state';

interface PriceOutput {
  budget: BudgetVerdict;
  evidence: EvidenceRef[];
  limitation?: string;
}

/** Compares a driver-provided cost estimate with a deterministic budget threshold. */
export const price = (
  result: CostEstimateResult | undefined,
  thresholdUsd: number
): PriceOutput => {
  if (!result || !result.estimated) {
    return {
      budget: { status: 'undetermined', thresholdUsd, evidence: [] },
      evidence: [],
      limitation: 'Cost could not be estimated; governance remains undetermined.'
    };
  }

  const amount = result.amount ?? result.range?.high;
  if (amount === undefined) {
    return {
      budget: { status: 'undetermined', thresholdUsd, evidence: [] },
      evidence: [],
      limitation: 'Cost estimate omitted an amount and upper range.'
    };
  }

  const evidence: EvidenceRef[] = [
    {
      id: 'cost-1',
      source: 'cost',
      summary: `Estimated ${result.currency ?? 'USD'} ${amount}`,
      reference: result.notes
    }
  ];

  return {
    budget: {
      status: amount > thresholdUsd ? 'over_budget' : 'within_budget',
      currency: result.currency,
      amount: result.amount,
      ceiling: result.range?.high,
      thresholdUsd,
      evidence: ['cost-1']
    },
    evidence
  };
};
