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

export interface Config {
  ai?: {
    integrations?: {
      qualityScorecards?: {
        /**
         * The active driver identifier currently selected for agentic fallback routing.
         * The core orchestrator module reads this string value to resolve the active 
         * driver from the internal Map managed by the Extension Point.
         */
        provider: string;
      };
    };
  };
}
