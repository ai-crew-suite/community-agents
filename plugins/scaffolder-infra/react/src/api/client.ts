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
import type { ScaffolderInfraApi } from './apiRef';
import type {
  AiRunEvent,
  InfraGenerationRequest,
  PreviewGenerationInput
} from '../@types';

/** Stable AI Core route ID for non-writing infrastructure previews. */
export const SCAFFOLDER_INFRA_AGENT_ID = 'scaffolder-ai-infra';

/** HTTP/SSE client for preview generation and event replay. */
export class ScaffolderInfraClient implements ScaffolderInfraApi {
  private baseUrl?: string;

  constructor(
    private readonly options: {
      configApi: ConfigApi;
      discoveryApi: DiscoveryApi;
      fetchApi: FetchApi;
      identityApi: IdentityApi
    }
  ) {}

  /** Dispatches an advisory infrastructure validation run and returns its live chunk stream. */
  async *previewGeneration(input: PreviewGenerationInput): AsyncGenerator<AiRunEvent> {
    const request: InfraGenerationRequest = { version: 1, source: 'manual', ...input };

    yield* this.read(
      await this.stream(`agents/${SCAFFOLDER_INFRA_AGENT_ID}/runs`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(await this.headers())
        },
        body: JSON.stringify({ input: { query: JSON.stringify(request) } })
      })
    );
  }

  /** Connects to historical run channels, passing optional event offsets for seamless crash recovery. */
  async *streamRunEvents(runId: string, lastEventId?: number): AsyncGenerator<AiRunEvent> {
    yield* this.read(
      await this.stream(`runs/${runId}/events`, {
        method: 'GET',
        headers: {
          ...(await this.headers()),
          ...(lastEventId === undefined ? {} : { 'Last-Event-ID': String(lastEventId) })
        }
      })
    );
  }

  /** Resolves and returns bearer authentication credentials from user token state. */
  private async headers(): Promise<Record<string, string>> {
    const { token } = await this.options.identityApi.getCredentials();
    return token ? { authorization: `Bearer ${token}` } : {};
  }

  /** Performs base routing discoveries and hits backend fetch streams over explicit HTTP methods. */
  private async stream(path: string, options: RequestInit): Promise<ReadableStream> {
    if (!this.baseUrl) {
      this.baseUrl = await this.options.discoveryApi.getBaseUrl(
        this.options.configApi.getOptionalString('ai.endpointPath') ?? 'ai-core'
      );
    }

    const response = await this.options.fetchApi.fetch(`${this.baseUrl}/${path}`, options);
    if (!response.ok) throw new Error(`Failed to retrieve data from path ${path}`);
    if (!response.body) throw new Error(`No stream available from path ${path}`);

    return response.body;
  }

  /** Feeds streaming byte arrays into text decoder and event-source token pipelines. */
  private async *read(stream: ReadableStream): AsyncGenerator<AiRunEvent> {
    try {
      const reader = stream
        .pipeThrough(new TextDecoderStream())
        .pipeThrough(new EventSourceParserStream())
        .getReader();

      while (true) {
        const { done, value } = await reader.read();
        if (done) return;

        const event = this.event(value);
        if (event) yield event;
      }
    } catch (error) {
      yield {
        type: 'error',
        data: {
          runId: 'unknown',
          message: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  /** Validates and parses incoming stream messages into explicit workflow graph data events. */
  private event(event: ParsedEvent): AiRunEvent | undefined {
    const allowedTypes = ['step', 'tool_call', 'tool_result', 'artifact', 'done', 'error'];
    if (!allowedTypes.includes(event.event)) return undefined;

    try {
      return { type: event.event, data: JSON.parse(event.data) } as AiRunEvent;
    } catch {
      return event.event === 'error'
        ? {
            type: 'error',
            data: { runId: 'unknown', message: event.data || 'Unknown error' }
          }
        : undefined;
    }
  }
}
