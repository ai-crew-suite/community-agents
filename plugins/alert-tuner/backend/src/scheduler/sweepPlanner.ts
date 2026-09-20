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
import type { AlertTuningRequest } from '../workflow/state';

/** A previously proposed alert, used to enforce the re-proposal cooldown. */
export type SweepHistoryEntry = {
  /** Service or alert identifier the earlier proposal covered. */
  target: string;
  /** ISO-8601 timestamp of the last proposal for that target. */
  proposedAt: string;
};

/** One bounded run to dispatch during a sweep. */
export type SweepDispatchPlan = {
  /** Deterministic dedupe key for the planned dispatch. */
  id: string;
  /** Versioned request payload sent to the agent run route. */
  request: AlertTuningRequest;
};

/**
 * Builds the bounded dispatch plan for one weekly sweep.
 *
 * Targets proposed within the cooldown window are skipped so a sweep cannot
 * re-open the same tuning discussion every week, and the plan is hard-capped so
 * a large service inventory can never fan out into an unbounded run count.
 * Scheduled requests always carry `source: 'scheduler'`, which the workflow uses
 * to keep them advisory.
 *
 * @param input - Service inventory, caps, prior proposal history, and the clock.
 */
export const planSweep = (input: {
  services: string[];
  windowDays: number;
  maxSweepAlerts: number;
  cooldownDays: number;
  history?: SweepHistoryEntry[];
  now?: () => Date;
}): SweepDispatchPlan[] => {
  const now = (input.now ?? (() => new Date()))().getTime();
  const cooldownMs = Math.max(input.cooldownDays, 0) * 24 * 60 * 60 * 1000;

  const cooling = new Set(
    (input.history ?? [])
      .filter((entry) => {
        const proposedAt = Date.parse(entry.proposedAt);
        return !Number.isNaN(proposedAt) && now - proposedAt < cooldownMs;
      })
      .map((entry) => entry.target)
  );

  return [...new Set(input.services)]
    .filter((service) => service && !cooling.has(service))
    .slice(0, Math.max(input.maxSweepAlerts, 0))
    .map((service) => ({
      id: `alert-ai-tuner-sweep-${service}`,
      request: {
        version: 1 as const,
        source: 'scheduler' as const,
        service,
        windowDays: input.windowDays,
        // Sweeps never request the publish path: a machine identity holds no
        // approval authority, so an autonomous PR must be impossible by design.
        publish: false,
      },
    }));
};
