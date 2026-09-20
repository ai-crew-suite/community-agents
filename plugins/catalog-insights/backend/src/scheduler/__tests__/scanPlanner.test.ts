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
import { describe, expect, it } from 'vitest';
import { planScan, SCAN_PROBE_QUESTION } from '../scanPlanner';

const entity = (name: string): CatalogEntitySummary => ({
  ref: `component:default/${name}`,
  kind: 'Component',
  namespace: 'default',
  name,
  annotations: { 'backstage.io/kubernetes-id': name },
  tags: [],
});

describe('planScan', () => {
  it('emits one scheduler-sourced probe request per entity, in order', () => {
    const plan = planScan({
      entities: [entity('a'), entity('b')],
      maxScanEntities: 10,
    });

    expect(plan).toEqual([
      {
        entityRef: 'component:default/a',
        request: {
          version: 1,
          entityRef: 'component:default/a',
          question: SCAN_PROBE_QUESTION,
          source: 'scheduler',
        },
      },
      {
        entityRef: 'component:default/b',
        request: {
          version: 1,
          entityRef: 'component:default/b',
          question: SCAN_PROBE_QUESTION,
          source: 'scheduler',
        },
      },
    ]);
  });

  it('caps the plan at maxScanEntities', () => {
    const plan = planScan({
      entities: [entity('a'), entity('b'), entity('c')],
      maxScanEntities: 2,
    });

    expect(plan.map(item => item.entityRef)).toEqual([
      'component:default/a',
      'component:default/b',
    ]);
  });

  it('returns an empty plan for no entities', () => {
    expect(planScan({ entities: [], maxScanEntities: 25 })).toEqual([]);
  });
});
