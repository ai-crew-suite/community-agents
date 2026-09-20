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
import type { CatalogEntitySummary } from '@ai-crew-suite/plugin-kernel-node';
import type { CatalogInsightRequest } from '../workflow/state';

/**
 * One planned insight run for the nightly scan: a fixed deployment-health
 * probe against a single scanned entity.
 */
export type ScanPlanItem = {
  entityRef: string;
  request: CatalogInsightRequest;
};

/** Fixed question dispatched for each scanned entity. */
export const SCAN_PROBE_QUESTION =
  'Summarize the current deployment health of this service and flag any failing workloads.';

/**
 * Pure planner for the nightly scan. Caps the entity list to the configured
 * budget and emits one bounded `CatalogInsightRequest` per scanned entity.
 * Ordering follows the input list (catalog query order is stable), so scans
 * are deterministic.
 */
export const planScan = (input: {
  entities: CatalogEntitySummary[];
  maxScanEntities: number;
}): ScanPlanItem[] =>
  input.entities.slice(0, input.maxScanEntities).map(entity => ({
    entityRef: entity.ref,
    request: {
      version: 1,
      entityRef: entity.ref,
      question: SCAN_PROBE_QUESTION,
      source: 'scheduler',
    },
  }));
