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
   * AI Crew Suite configuration
   */
  ai?: {
    runtime?: {
      /**
       * Agent runtime persistence configuration
       */
      stores?: {
        /**
         * Conversation session persistence. Defaults to the `database` backend.
         */
        sessions?: {
          /**
           * Storage backend for sessions. `database` uses the Backstage core
           * database service (PostgreSQL, MySQL, or SQLite per the site
           * configuration); `redis` uses the connection under
           * `ai.runtime.stores.redis`. Defaults to `database`.
           */
          backend?: 'database' | 'redis';

          /**
           * Optional TTL in milliseconds applied to session entries and
           * refreshed on every write. Redis backend only.
           */
          ttlMs?: number;

          /**
           * Maximum number of messages retained per session. The oldest
           * messages are trimmed first. Redis backend only. Defaults to 100.
           */
          maxMessages?: number;
        };

        /**
         * Resumable run checkpoint persistence. Defaults to the `database` backend.
         */
        checkpoints?: {
          /**
           * Storage backend for checkpoints. `database` uses the Backstage core
           * database service; `redis` uses the connection under
           * `ai.runtime.stores.redis`. Defaults to `database`.
           */
          backend?: 'database' | 'redis';

          /**
           * Optional TTL in milliseconds applied to checkpoint entries and
           * refreshed on every write. Redis backend only.
           */
          ttlMs?: number;
        };

        /**
         * Redis connection shared by all Redis-backed runtime stores.
         * Required when any store selects the `redis` backend.
         */
        redis?: {
          /**
           * Connection URL, for example `redis://localhost:6379` or
           * `rediss://user:secret@host:6380` for TLS.
           */
          connection: string;

          /**
           * Prefix applied to every Redis key written by the runtime stores.
           * Defaults to `ai-core`.
           */
          keyPrefix?: string;
        };
      };
    };
  };
}
