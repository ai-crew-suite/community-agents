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
import type { AlertHistoryEntry } from '@ai-crew-suite/plugin-kernel-node';
import type { TunerToolRunner } from './TunerToolRunner';
import type { AlertTuningRequest } from '../workflow/state';

/** Tool ID supplying alert firing history. */
export const ALERT_HISTORY_TOOL_ID = 'incident.alert.history';

/**
 * Reads window-clamped alert firing history through the registered
 * `incident.alert.history` tool.
 *
 * The provider result shape is not trusted: only array payloads are accepted so
 * a driver returning an unexpected envelope degrades to zero samples with a
 * recorded limitation instead of corrupting the statistics.
 */
export class AlertHistoryReader {
  /**
   * @param tools - Bounded tool facade shared across the run.
   * @param maxEntries - Hard clamp applied to the provider `limit`.
   */
  constructor(
    private readonly tools: TunerToolRunner,
    private readonly maxEntries: number
  ) {}

  /**
   * Fetches firing history for one alert definition or service scope.
   *
   * @param request - The validated tuning request supplying the scope.
   * @param window - The inclusive analysis window.
   */
  async read(
    request: AlertTuningRequest,
    window: { from: string; to: string }
  ): Promise<AlertHistoryEntry[]> {
    const result = await this.tools.invoke<
      { alertId?: string; service?: string; since: string; until: string; limit: number },
      unknown
    >(ALERT_HISTORY_TOOL_ID, {
      alertId: request.alertId,
      service: request.service,
      since: window.from,
      until: window.to,
      limit: this.maxEntries,
    });

    const output = result?.output;

    if (!Array.isArray(output)) {
      return [];
    }

    return output
      .filter((entry): entry is AlertHistoryEntry => typeof entry === 'object' && entry !== null)
      .slice(0, this.maxEntries);
  }
}
