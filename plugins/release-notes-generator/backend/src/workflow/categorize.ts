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
import type { CategoryTaxonomy } from '../config';
import type { ChangeItem } from './state';

/** Categorizes a pull request title using taxonomy keywords and conventional prefixes. */
export const categorizeTitle = (
  title: string,
  taxonomy: CategoryTaxonomy,
): ChangeItem['category'] => {
  const normalized = title.toLowerCase();
  for (const category of ['breaking', 'internal', 'feature', 'fix', 'improvement'] as const) {
    if (taxonomy[category].some(keyword => normalized.includes(keyword.toLowerCase()))) {
      return category;
    }
  }
  return 'improvement';
};

/** Removes internal chores so customer-facing drafts contain only publishable changes. */
export const filterCustomerChanges = (changes: ChangeItem[]) => ({
  included: changes.filter(change => change.category !== 'internal'),
  filteredCount: changes.filter(change => change.category === 'internal').length,
});
