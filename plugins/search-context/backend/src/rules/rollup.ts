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
import type { ConsumerImpact, OwnerRollup } from '../workflow/state';

const rank = { critical: 4, high: 3, medium: 2, low: 1 };

/** Produces a stable impacted-only owner rollup, retaining an explicit unowned bucket. */
export const rollupOwners = (impacts: ConsumerImpact[]): OwnerRollup[] =>
  Object.values(
    impacts
      .filter(item => item.classification === 'impacted')
      .reduce<Record<string, OwnerRollup>>((result, item) => {
        const owner = item.owner;
        const current = result[owner] ?? {
          owner,
          impactedCount: 0,
          highestSeverity: item.severity!,
          consumers: [],
        };

        current.impactedCount += 1;
        current.consumers.push(item.entityRef);

        if (rank[item.severity!] > rank[current.highestSeverity])
          current.highestSeverity = item.severity!;

        result[owner] = current;

        return result;
      }, {}),
  )
    .map(item => ({ ...item, consumers: item.consumers.sort() }))
    .sort(
      (left, right) =>
        rank[right.highestSeverity] - rank[left.highestSeverity] ||
        right.impactedCount - left.impactedCount ||
        left.owner.localeCompare(right.owner),
    );
