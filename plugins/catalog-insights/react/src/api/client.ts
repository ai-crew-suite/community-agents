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
import {
  EventSourceParserStream,
  type ParsedEvent,
} from 'eventsource-parser/stream';
import type {
  ConfigApi,
  DiscoveryApi,
  FetchApi,
  IdentityApi,
} from '@backstage/core-plugin-api';
import type { CatalogAiInsightsApi } from './apiRef';
import type {
  AiRunEvent,
  AskInsightInput,
  CatalogInsightRequest,
} from '../@types';

/** Stable AI Core agent identifier for the catalog insights backend workflow. */
export const CATALOG_AI_INSIGHTS_AGENT_ID = 'catalog-ai-insights';

/**
 * HTTP/SSE client for catalog AI insights. Speaks to the shared AI Core
 * backend (`ai-core` endpoint) and translates the run-event stream into typed
 * `AiRunEvent` values.
 */
export class CatalogAiInsightsClient implements CatalogAiInsightsApi {
  private readonly discoveryApi: DiscoveryApi;
  private readonly fetchApi: FetchApi;
  private readonly configApi: ConfigApi;
  private readonly identityApi: IdentityApi;
  private baseUrl?: string;

  constructor(options: {
    discoveryApi: DiscoveryApi;
    fetchApi: FetchApi;
    configApi: ConfigApi;
    identityApi: IdentityApi;
  }) {
    this.discoveryApi = options.discoveryApi;
    this.fetchApi = options.fetchApi;
    this.configApi = options.configApi;
    this.identityApi = options.identityApi;
  }

  private async getBaseUrl(): Promise<string> {
    if (!this.baseUrl) {
      const endpointPath = this.configApi.getOptionalString('ai.endpointPath');
      this.baseUrl = await this.discoveryApi.getBaseUrl(
        endpointPath ?? 'ai-core',
      );
    }
    return this.baseUrl;
  }

  private async fetch(path: string, options: RequestInit = {}) {
    const baseUrl = await this.getBaseUrl();
    const response = await this.fetchApi.fetch(`${baseUrl}/${path}`, options);
    if (!response.ok) {
      throw new Error(`Failed to retrieve data from path ${path}`);
    }
    return response;
  }

  async *askQuestion(input: AskInsightInput): AsyncGenerator<AiRunEvent> {
    const { token } = await this.identityApi.getCredentials();
    const request: CatalogInsightRequest = {
      version: 1,
      source: 'manual',
      ...input,
    };
    const stream = await this.fetchSse(
      `agents/${CATALOG_AI_INSIGHTS_AGENT_ID}/runs`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          input: { query: JSON.stringify(request) },
        }),
      },
    );
    yield* this.readSse(stream);
  }

  async *streamRunEvents(
    runId: string,
    lastEventId?: number,
  ): AsyncGenerator<AiRunEvent> {
    const { token } = await this.identityApi.getCredentials();
    const stream = await this.fetchSse(`runs/${runId}/events`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(typeof lastEventId === 'number'
          ? { 'Last-Event-ID': String(lastEventId) }
          : {}),
      },
    });
    yield* this.readSse(stream);
  }

  private async fetchSse(path: string, options: RequestInit = {}) {
    const response = await this.fetch(path, options);
    if (!response.body) {
      throw new Error(`No stream available from path ${path}`);
    }
    return response.body;
  }

  private async *readSse(stream: ReadableStream): AsyncGenerator<AiRunEvent> {
    try {
      const reader = stream
        .pipeThrough(new TextDecoderStream())
        .pipeThrough(new EventSourceParserStream())
        .getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        const parsed = this.toRunEvent(value);
        if (parsed) {
          yield parsed;
        }
      }
    } catch (e) {
      yield {
        type: 'error',
        data: {
          runId: 'unknown',
          message: `Failed to complete run due to error: ${
            e instanceof Error ? e.message : String(e)
          }`,
        },
      };
    }
  }

  private toRunEvent(event: ParsedEvent): AiRunEvent | undefined {
    switch (event.event) {
      case 'step':
      case 'token':
      case 'tool_call':
      case 'tool_result':
      case 'usage':
      case 'approval_request':
      case 'artifact':
      case 'done':
      case 'error': {
        try {
          return {
            type: event.event,
            data: JSON.parse(event.data),
          } as AiRunEvent;
        } catch {
          if (event.event === 'error') {
            return {
              type: 'error',
              data: {
                runId: 'unknown',
                message: event.data || 'Unknown error',
              },
            };
          }
          return undefined;
        }
      }
      default:
        return undefined;
    }
  }
}
