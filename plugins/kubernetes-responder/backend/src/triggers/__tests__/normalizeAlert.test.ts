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
import {
  TriggerValidationError,
  normalizeIncidentTrigger,
  parseTriggerQuery,
} from '../normalizeAlert';

const NOW = new Date('2026-08-20T12:00:00.000Z');
const options = { defaultSource: 'manual' as const, now: () => NOW };

describe('normalizeIncidentTrigger', () => {
  it('normalizes a full alertmanager payload', () => {
    const trigger = normalizeIncidentTrigger(
      {
        source: 'alertmanager',
        occurredAt: '2026-08-20T11:55:00.000Z',
        entityRef: 'component:default/payment-gateway',
        alertId: 'alert-42',
        severity: 'critical',
        summary: 'Pod payment-gateway-1 restarting',
        labels: { team: 'payments' },
      },
      options,
    );

    expect(trigger).toEqual({
      version: 1,
      source: 'alertmanager',
      occurredAt: '2026-08-20T11:55:00.000Z',
      entityRef: 'component:default/payment-gateway',
      cluster: undefined,
      namespace: undefined,
      workload: undefined,
      pod: undefined,
      alertId: 'alert-42',
      severity: 'critical',
      summary: 'Pod payment-gateway-1 restarting',
      labels: { team: 'payments' },
    });
  });

  it('accepts workload coordinates without an entityRef', () => {
    const trigger = normalizeIncidentTrigger(
      { cluster: 'prod', namespace: 'payments', workload: 'payment-gateway' },
      options,
    );
    expect(trigger.entityRef).toBeUndefined();
    expect(trigger.occurredAt).toBe(NOW.toISOString());
    expect(trigger.summary).toBe('Kubernetes incident trigger');
  });

  it('rejects payloads without a resolvable target', () => {
    expect(() => normalizeIncidentTrigger({ summary: 'x' }, options)).toThrow(
      TriggerValidationError,
    );
    expect(() =>
      normalizeIncidentTrigger({ cluster: 'prod', namespace: 'payments' }, options),
    ).toThrow(TriggerValidationError);
  });

  it('rejects invalid timestamps and unknown sources', () => {
    expect(() =>
      normalizeIncidentTrigger(
        { entityRef: 'component:default/a', occurredAt: 'not-a-date' },
        options,
      ),
    ).toThrow(TriggerValidationError);
    expect(() =>
      normalizeIncidentTrigger(
        { entityRef: 'component:default/a', source: 'carrier-pigeon' },
        options,
      ),
    ).toThrow(TriggerValidationError);
  });

  it('rejects oversized label maps and non-string labels', () => {
    const labels = Object.fromEntries(
      Array.from({ length: 30 }, (_, i) => [`k${i}`, 'v']),
    );
    expect(() =>
      normalizeIncidentTrigger({ entityRef: 'component:default/a', labels }, options),
    ).toThrow(TriggerValidationError);
    expect(() =>
      normalizeIncidentTrigger(
        { entityRef: 'component:default/a', labels: { bad: 5 } },
        options,
      ),
    ).toThrow(TriggerValidationError);
  });

  it('truncates oversized label values and summaries', () => {
    const trigger = normalizeIncidentTrigger(
      {
        entityRef: 'component:default/a',
        summary: 'x'.repeat(10_000),
        labels: { big: 'y'.repeat(1_000) },
      },
      options,
    );
    expect(trigger.summary).toHaveLength(2_048);
    expect(trigger.labels!.big).toHaveLength(256);
  });
});

describe('parseTriggerQuery', () => {
  it('parses JSON queries', () => {
    const trigger = parseTriggerQuery(
      JSON.stringify({ entityRef: 'component:default/a', summary: 'hi' }),
      options,
    );
    expect(trigger.entityRef).toBe('component:default/a');
  });

  it('rejects non-JSON queries with a validation error', () => {
    expect(() => parseTriggerQuery('plain text', options)).toThrow(
      TriggerValidationError,
    );
  });
});
