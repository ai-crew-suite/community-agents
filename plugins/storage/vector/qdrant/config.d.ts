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
   * Qdrant vector storage configuration
   *
   */
  ai?: {
    storage: {
      qdrant: {
        /**
         * Base URL of the Qdrant HTTP API. Defaults to process.env.QDRANT_URL, then http://localhost:6333
         */
        url?: string;

        /**
         * API key for Qdrant. Defaults to process.env.QDRANT_API_KEY
         */
        apiKey?: string;

        /**
         * Collection used to store embedding points. Defaults to embeddings
         */
        collectionName?: string;

        /**
         * The number of points sent to Qdrant per upsert batch. Defaults to 500
         */
        chunkSize?: number;

        /**
         * The default amount of embeddings to return when querying vectors with similarity search. Defaults to 4
         */
        amount?: number;
      };
    };
  };
}
