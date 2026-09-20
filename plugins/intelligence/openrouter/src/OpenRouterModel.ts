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
import { ChatOpenRouter } from '@langchain/openrouter';
import type { LoggerService } from '@backstage/backend-plugin-api';
import type { ModelDefinition } from '@ai-crew-suite/plugin-kernel-node';

/**
 * Configuration for one OpenRouter chat model registration.
 */
export type OpenRouterModelConfig = {
  /** Stable model registry ID used by AI agent `modelRef` values. */
  id?: string;
  /** OpenRouter model identifier, such as `openai/gpt-4o-mini`. */
  model: string;
  /** Optional API key; omitted values use `OPENROUTER_API_KEY`. */
  apiKey?: string;
  /** Optional OpenRouter-compatible base URL. */
  baseURL?: string;
  /** Sampling temperature passed to OpenRouter. */
  temperature?: number;
  /** Maximum generated tokens. */
  maxTokens?: number;
  /** Nucleus sampling value. */
  topP?: number;
  /** Optional attribution URL sent through OpenRouter headers. */
  siteUrl?: string;
  /** Optional attribution title sent through OpenRouter headers. */
  siteName?: string;
};

/**
 * OpenRouter module configuration. A single model can be configured directly,
 * or multiple models can be supplied through `models`.
 */
export type OpenRouterConfig = Partial<OpenRouterModelConfig> & {
  /** Optional list of model registrations. */
  models?: OpenRouterModelConfig[];
};

export type OpenRouterModelRegistration = ModelDefinition;

const assertPositiveNumber = (
  value: number | undefined,
  field: string,
  logger: LoggerService,
) => {
  if (value !== undefined && value <= 0) {
    const message = `OpenRouter ${field} must be greater than 0.`;
    logger.error(message);
    throw new Error(message);
  }
};

const resolveModelConfigs = (config: OpenRouterConfig): OpenRouterModelConfig[] => {
  if (config.models?.length) {
    return config.models;
  }

  return [config as OpenRouterModelConfig];
};

/**
 * Creates validated OpenRouter model registrations for the AI backend.
 */
export const createOpenRouterModels = ({
  config,
  logger,
}: {
  config: OpenRouterConfig;
  logger: LoggerService;
}): OpenRouterModelRegistration[] =>
  resolveModelConfigs(config).map(modelConfig => {
    const modelName = modelConfig.model?.trim();
    if (!modelName) {
      logger.error('OpenRouter model is required.');
      throw new Error('OpenRouter model is required.');
    }

    assertPositiveNumber(modelConfig.maxTokens, 'maxTokens', logger);

    const id = modelConfig.id?.trim() || modelName;
    return {
      id,
      model: new ChatOpenRouter({
        apiKey: modelConfig.apiKey,
        model: modelName,
        baseURL: modelConfig.baseURL,
        temperature: modelConfig.temperature,
        maxTokens: modelConfig.maxTokens,
        topP: modelConfig.topP,
        siteUrl: modelConfig.siteUrl,
        siteName: modelConfig.siteName,
      }),
    };
  });