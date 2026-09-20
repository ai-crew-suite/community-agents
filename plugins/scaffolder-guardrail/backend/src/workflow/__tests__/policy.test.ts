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
import { describe, expect, it } from 'vitest';
import { adjudicate } from '../adjudicate';
import { fingerprintRequest } from '../fingerprint';
import { canonicalizeParameters } from '../intake';
import { proposeMutation } from '../mutate';
import { price } from '../price';

describe('guardrail deterministic helpers', () => {
  it('canonicalizes key order and enum-like string case for a stable fingerprint', () => {
    const first = {
      version: 1 as const,
      source: 'manual' as const,
      templateRef: 'template:default/db',
      parameters: canonicalizeParameters({ b: ' TEST ', a: 'db.m5.large' }) as Record<string, unknown>
    };

    const second = {
      ...first,
      parameters: canonicalizeParameters({ a: 'DB.M5.LARGE', b: 'test' }) as Record<string, unknown>
    };

    expect(fingerprintRequest(first)).toBe(fingerprintRequest(second));
  });

  it('defaults unmapped policy violations to blocking', () => {
    const result = adjudicate({
      policies: [{
        policyId: 'corp',
        passed: false,
        violations: [{ rule: 'new-rule', message: 'denied' }]
      }],
      severity: {}
    });

    expect(result.violations[0]).toMatchObject({ severity: 'blocking', rule: 'new-rule' });
  });

  it('uses a range upper bound and fails closed for an unestimated cost', () => {
    expect(
      price({ estimated: true, range: { low: 100, high: 1200 } }, 1000).budget.status
    ).toBe('over_budget');

    expect(price({ estimated: false }, 1000).budget.status).toBe('undetermined');
  });

  it('offers only the configured lowest instance-type rung for a negotiable violation', () => {
    const mutations = proposeMutation({
      parameters: { instanceType: 'db.m5.16xlarge' },
      violations: [{
        id: 'pol-1',
        rule: 'instance-type-not-approved',
        message: 'no',
        parameter: 'instanceType',
        severity: 'negotiable',
        evidence: ['pol-1']
      }],
      ladder: ['db.m5.16xlarge', 'db.m5.large']
    });

    expect(mutations[0]).toMatchObject({ from: 'db.m5.16xlarge', to: 'db.m5.large' });
  });
});
