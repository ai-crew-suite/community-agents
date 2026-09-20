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
import type { HandoverRequest } from './state';

/** Resolves the bounded trailing window used by a handover run. */
export const resolveWindow = (
  request: HandoverRequest,
  options: { defaultHours: number; maxHours: number; now?: () => Date }
) => {
  const end = request.endsAt
    ? new Date(request.endsAt)
    : (options.now ?? (() => new Date()))();

  if (Number.isNaN(end.getTime())) {
    throw new Error("Request field 'endsAt' must be an ISO timestamp");
  }

  const requested = request.windowHours ?? options.defaultHours;

  if (!Number.isFinite(requested) || requested <= 0) {
    throw new Error("Request field 'windowHours' must be a positive number");
  }

  const hours = Math.min(requested, options.maxHours);

  return {
    start: new Date(end.getTime() - hours * 3_600_000).toISOString(),
    end: end.toISOString(),
    hours,
    clamped: hours !== requested,
  };
};
