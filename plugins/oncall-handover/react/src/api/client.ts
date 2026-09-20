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
import { EventSourceParserStream, type ParsedEvent } from 'eventsource-parser/stream';
import type { ConfigApi, DiscoveryApi, FetchApi, IdentityApi } from '@backstage/core-plugin-api';
import type { OncallHandoverApi } from './apiRef';
import type { AiRunEvent, HandoverRequest } from '../@types';

/** Stable backend agent route identifier. */
export const ONCALL_HANDOVER_AGENT_ID = 'oncall-handover-assistant';

/** HTTP/SSE implementation for the on-call handover API. */
export class OncallHandoverClient implements OncallHandoverApi {
  private baseUrl?: string;

  constructor(
    private readonly options: {
      configApi: ConfigApi;
      discoveryApi: DiscoveryApi;
      fetchApi: FetchApi;
      identityApi: IdentityApi;
    }
  ) {}

  private async base() {
    if (!this.baseUrl) {
      this.baseUrl = await this.options.discoveryApi.getBaseUrl(
        this.options.configApi.getOptionalString('ai.endpointPath') ?? 'ai-core'
      );
    }
    return this.baseUrl;
  }

  private async response(path: string, options: RequestInit) {
    const result = await this.options.fetchApi.fetch(`${await this.base()}/${path}`, options);

    if (!result.ok) throw new Error(`Failed to retrieve data from path ${path}`);
    if (!result.body) throw new Error(`No stream available from path ${path}`);

    return result.body;
  }

  async *compileBrief(input: Omit<HandoverRequest, 'version' | 'source'>): AsyncGenerator<AiRunEvent> {
    const { token } = await this.options.identityApi.getCredentials();
    const request: HandoverRequest = { version: 1, source: 'manual', ...input };

    yield* this.read(
      await this.response(`agents/${ONCALL_HANDOVER_AGENT_ID}/runs`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ input: { query: JSON.stringify(request) } }),
      })
    );
  }

  async *streamRunEvents(runId: string, lastEventId?: number): AsyncGenerator<AiRunEvent> {
    const { token } = await this.options.identityApi.getCredentials();
    yield* this.read(
      await this.response(`runs/${runId}/events`, {
        method: 'GET',
        headers: {
          authorization: `Bearer ${token}`,
          ...(lastEventId === undefined ? {} : { 'Last-Event-ID': String(lastEventId) }),
        },
      })
    );
  }

  private async *read(stream: ReadableStream): AsyncGenerator<AiRunEvent> {
    try {
      const reader = stream
        .pipeThrough(new TextDecoderStream())
        .pipeThrough(new EventSourceParserStream())
        .getReader();

      while (true) {
        const { done, value } = await reader.read();
        if (done) return;

        const parsed = this.event(value);
        if (parsed) yield parsed;
      }
    } catch (error) {
      yield {
        type: 'error',
        data: {
          runId: 'unknown',
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  private event(event: ParsedEvent): AiRunEvent | undefined {
    if (!['step', 'tool_call', 'tool_result', 'artifact', 'done', 'error'].includes(event.event)) {
      return undefined;
    }

    try {
      return { type: event.event, data: JSON.parse(event.data) } as AiRunEvent;
    } catch {
      return event.event === 'error'
        ? { type: 'error', data: { runId: 'unknown', message: event.data || 'Unknown error' } }
        : undefined;
    }
  }
}
