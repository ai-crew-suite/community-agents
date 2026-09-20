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
import { planShiftSchedule } from '../schedulePlanner';

describe('planShiftSchedule', () => {
  /**
   * Validates that the schedule planner generates exact, isolated operational request configurations
   * for every explicit shift target provided in the roster map.
   */
  it('creates one bounded scheduler request for each shift', () => {
    const scheduleInput = {
      windowHours: 12,
      shifts: [
        { cron: '0 8 * * *', team: 'sre-primary' },
        { cron: '0 16 * * *', team: 'sre-primary' },
      ],
    };

    const expectedOutput = [
      {
        id: 'oncall-handover-shift-0-8-*-*-*',
        cron: '0 8 * * *',
        request: {
          version: 1,
          source: 'scheduler',
          windowHours: 12,
          team: 'sre-primary',
        },
      },
      {
        id: 'oncall-handover-shift-0-16-*-*-*',
        cron: '0 16 * * *',
        request: {
          version: 1,
          source: 'scheduler',
          windowHours: 12,
          team: 'sre-primary',
        },
      },
    ];

    expect(planShiftSchedule(scheduleInput)).toEqual(expectedOutput);
  });
});
