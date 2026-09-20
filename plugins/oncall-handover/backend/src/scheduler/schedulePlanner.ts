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
import type { HandoverRequest } from '../workflow/state';

/** 
 * One authenticated run configuration to dispatch at a configured shift boundary. 
 */
export type ShiftDispatchPlan = {
  /** Deterministic string id safely built from the raw cron expression tokens. */
  id: string;
  /** The standard crontab expression regulating execution frequency. */
  cron: string;
  /** Pre-configured versioned request parameters bound to the target team. */
  request: HandoverRequest;
};

/**
 * Creates deterministic bounded request plans for each configured shift.
 * Replaces whitespace inside cron properties with dashes to compile safe entity identifiers.
 *
 * @param input - The schedule configuration blueprint payload.
 * @param input.shifts - An array of raw cron parameters coupled with target team strings.
 * @param input.windowHours - The uniform trailing lookback limit measured in hours.
 * @returns An array of processed ShiftDispatchPlan objects ready for scheduler assignment.
 */
export const planShiftSchedule = (input: {
  shifts: { cron: string; team: string }[];
  windowHours: number;
}): ShiftDispatchPlan[] =>
  input.shifts.map((shift) => ({
    id: `oncall-handover-shift-${shift.cron.replace(/\s+/g, '-')}`,
    cron: shift.cron,
    request: {
      version: 1,
      source: 'scheduler',
      windowHours: input.windowHours,
      team: shift.team,
    },
  }));
