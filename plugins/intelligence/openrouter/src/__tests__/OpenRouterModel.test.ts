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
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createOpenRouterModels, OpenRouterConfig } from '../OpenRouterModel';

vi.mock('@langchain/openrouter', () => ({
  ChatOpenRouter: vi.fn(function ChatOpenRouterMock(this: unknown) {
    return this;
  }),
}));

const createLogger = () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(),
});

const createModels = (config: OpenRouterConfig) => {
  const logger = createLogger();
  return { logger, models: createOpenRouterModels({ config, logger: logger as any }) };
};

describe('createOpenRouterModels', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a single ChatOpenRouter model registration', () => {
    const { models } = createModels({
      id: 'fast-chat',
      model: ' openai/gpt-4o-mini ',
      apiKey: 'test-key',
      baseURL: 'https://openrouter.example.test/api/v1',
      temperature: 0.2,
      maxTokens: 1024,
      topP: 0.9,
      siteUrl: 'https://example.test',
      siteName: 'AI Crew Suite',
    });

    expect(models).toEqual([{ id: 'fast-chat', model: expect.any(Object) }]);
    expect(ChatOpenRouter).toHaveBeenCalledWith({
      apiKey: 'test-key',
      model: 'openai/gpt-4o-mini',
      baseURL: 'https://openrouter.example.test/api/v1',
      temperature: 0.2,
      maxTokens: 1024,
      topP: 0.9,
      siteUrl: 'https://example.test',
      siteName: 'AI Crew Suite',
    });
  });

  it('uses the OpenRouter model name as the registry id when no id is configured', () => {
    const { models } = createModels({ model: 'anthropic/claude-3.5-sonnet' });

    expect(models[0]?.id).toBe('anthropic/claude-3.5-sonnet');
  });

  it('creates multiple configured model registrations', () => {
    const { models } = createModels({
      models: [
        { id: 'primary', model: 'openai/gpt-4o-mini' },
        { id: 'reviewer', model: 'anthropic/claude-3.5-sonnet' },
      ],
    });

    expect(models.map(model => model.id)).toEqual(['primary', 'reviewer']);
    expect(ChatOpenRouter).toHaveBeenCalledTimes(2);
  });

  it('logs and rejects missing model configuration', () => {
    const logger = createLogger();

    expect(() =>
      createOpenRouterModels({
        config: { model: '   ' },
        logger: logger as any,
      }),
    ).toThrow('OpenRouter model is required.');
    expect(logger.error).toHaveBeenCalledWith('OpenRouter model is required.');
    expect(ChatOpenRouter).not.toHaveBeenCalled();
  });

  it('logs and rejects invalid max token configuration', () => {
    const logger = createLogger();

    expect(() =>
      createOpenRouterModels({
        config: { model: 'openai/gpt-4o-mini', maxTokens: 0 },
        logger: logger as any,
      }),
    ).toThrow('OpenRouter maxTokens must be greater than 0.');
    expect(logger.error).toHaveBeenCalledWith(
      'OpenRouter maxTokens must be greater than 0.',
    );
    expect(ChatOpenRouter).not.toHaveBeenCalled();
  });
});