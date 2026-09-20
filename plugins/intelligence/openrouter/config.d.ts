/*
 * Copyright 2024 Larder Software Limited
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
   * AI backend model provider configuration.
   *
   */
  ai: {
    models: {
      openrouter: {
        /**
         * Optional list of OpenRouter model registrations. Use this when registering
         * more than one model with the AI backend.
         */
        models?: Array<{
          /** Stable model registry ID used by agent modelRef values. Defaults to the model name. */
          id?: string;

          /** OpenRouter model identifier, such as openai/gpt-4o-mini. */
          model: string;

          /** API key for OpenRouter. Defaults to process.env.OPENROUTER_API_KEY. */
          apiKey?: string;

          /** Optional OpenRouter-compatible base URL. */
          baseURL?: string;

          /** Sampling temperature. */
          temperature?: number;

          /** Maximum generated tokens. */
          maxTokens?: number;

          /** Nucleus sampling value. */
          topP?: number;

          /** Optional attribution URL sent to OpenRouter. */
          siteUrl?: string;

          /** Optional attribution title sent to OpenRouter. */
          siteName?: string;
        }>;

        /**
         * Stable model registry ID for single-model configuration. Defaults to the model name.
         */
        id?: string;

        /**
         * OpenRouter model identifier for single-model configuration.
         */
        model?: string;

        /**
         * API key for OpenRouter. Defaults to process.env.OPENROUTER_API_KEY.
         */
        apiKey?: string;

        /**
         * Optional OpenRouter-compatible base URL.
         */
        baseURL?: string;

        /** Sampling temperature. */
        temperature?: number;

        /** Maximum generated tokens. */
        maxTokens?: number;

        /** Nucleus sampling value. */
        topP?: number;

        /** Optional attribution URL sent to OpenRouter. */
        siteUrl?: string;

        /** Optional attribution title sent to OpenRouter. */
        siteName?: string;
      };
    };
  };
}
