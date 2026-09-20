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
  /**
   * AI Crew Suite integration configuration.
   */
  ai?: {
    /**
     * Third-party integration modules.
     */
    integrations?: {
      /**
       * Real-time human communication integration configuration.
       *
       * Provider connection details are owned by the sibling
       * `plugin-ai-core-backend-module-communication-<provider>` packages.
       */
      communication?: {
        /**
         * Identifier of the registered driver to activate, such as `slack`.
         * The core module resolves this from the communication driver
         * extension point.
         */
        provider: string;
      };
    };
  };
}
