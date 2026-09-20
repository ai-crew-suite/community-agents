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
import { planSweep } from '../sweepPlanner';

const NOW = new Date('2026-02-01T06:00:00.000Z');

describe('planSweep Platform Robustness Suite', () => {
  /** Happy Path Validation */
  it('plans propose-only scheduler runs for each service', () => {
    const plans = planSweep({
      services: ['checkout', 'payments'],
      windowDays: 14,
      maxSweepAlerts: 25,
      cooldownDays: 30,
      now: () => NOW,
    });

    expect(plans).toHaveLength(2);
    expect(plans[0]).toMatchObject({
      id: 'alert-ai-tuner-sweep-checkout',
      request: { version: 1, source: 'scheduler', service: 'checkout', publish: false },
    });
    expect(plans.every((plan) => plan.request.publish === false)).toBe(true);
  });

  /** Inventory Truncation */
  it('caps the plan at the configured sweep limit', () => {
    const plans = planSweep({
      services: ['a', 'b', 'c', 'd'],
      windowDays: 14,
      maxSweepAlerts: 2,
      cooldownDays: 30,
      now: () => NOW,
    });

    expect(plans.map((plan) => plan.request.service)).toEqual(['a', 'b']);
  });

  /** Cooldown Window Tracking */
  it('skips targets still inside the re-proposal cooldown', () => {
    const plans = planSweep({
      services: ['checkout', 'payments'],
      windowDays: 14,
      maxSweepAlerts: 25,
      cooldownDays: 30,
      history: [
        { target: 'checkout', proposedAt: '2026-01-25T00:00:00.000Z' },
        { target: 'payments', proposedAt: '2025-11-01T00:00:00.000Z' },
      ],
      now: () => NOW,
    });

    expect(plans.map((plan) => plan.request.service)).toEqual(['payments']);
  });

  /** Deduplication Constraints */
  it('deduplicates and drops empty service entries', () => {
    const plans = planSweep({
      services: ['checkout', 'checkout', ''],
      windowDays: 14,
      maxSweepAlerts: 25,
      cooldownDays: 30,
      now: () => NOW,
    });

    expect(plans).toHaveLength(1);
  });

  it('safely tolerates corrupt or missing history timestamps without throwing exceptions', () => {
    const plans = planSweep({
      services: ['checkout', 'payments', 'auth-service'],
      windowDays: 14,
      maxSweepAlerts: 10,
      cooldownDays: 30,
      history: [
        { target: 'checkout', proposedAt: 'garbage-date-string' }, // Malformed string
        { target: 'payments', proposedAt: '' },                    // Empty string
        { target: 'auth-service', proposedAt: '2026-01-25T00:00:00.000Z' }, // Valid cooling target
      ],
      now: () => NOW,
    });

    // Corrupt database data must be discarded, falling back to treating services as actionable
    expect(plans.map(p => p.request.service)).toEqual(['checkout', 'payments']);
  });

  it('handles negative config input signs gracefully by treating them as 0 bounds', () => {
    const plans = planSweep({
      services: ['checkout', 'payments'],
      windowDays: 14,
      maxSweepAlerts: -5, // Injected configuration failure sign
      cooldownDays: -10,  // Negative cooldown defaults
      now: () => NOW,
    });

    // Negative limits collapse to 0 entries safely without throwing out-of-bounds array slicing exceptions
    expect(plans).toHaveLength(0);
  });

  it('evaluates exact threshold boundaries precisely to the millisecond check point', () => {
    const cooldownDays = 30;
    const cooldownMs = cooldownDays * 24 * 60 * 60 * 1000;

    const exactCooldownExpirationTime = new Date(NOW.getTime() - cooldownMs);
    const oneMillisecondInsideCooldown = new Date(exactCooldownExpirationTime.getTime() + 1);
    const oneMillisecondOutsideCooldown = new Date(exactCooldownExpirationTime.getTime() - 1);

    const plans = planSweep({
      services: ['service-cooling', 'service-expired'],
      windowDays: 14,
      maxSweepAlerts: 10,
      cooldownDays,
      history: [
        { target: 'service-cooling', proposedAt: oneMillisecondInsideCooldown.toISOString() },
        { target: 'service-expired', proposedAt: oneMillisecondOutsideCooldown.toISOString() },
      ],
      now: () => NOW,
    });

    // service-cooling is still 1ms inside the cooldown fence, so it must be skipped.
    expect(plans.map(p => p.request.service)).toEqual(['service-expired']);
  });
});
