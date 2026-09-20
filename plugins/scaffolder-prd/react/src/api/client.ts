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
import type { AiRunEvent, PrdRequest, StartPrdInput } from '../@types';
import type { ScaffolderPrdApi } from './apiRef';

/** Stable AI Core agent ID for PRD delivery blueprints. */
export const SCAFFOLDER_PRD_AGENT_ID = 'scaffolder-ai-prd';

/** Authenticated HTTP/SSE client for live and replayed PRD blueprints. */
export class ScaffolderPrdClient implements ScaffolderPrdApi {
  private baseUrl?: string;

  constructor(
    private readonly options: {
      configApi: ConfigApi;
      discoveryApi: DiscoveryApi;
      fetchApi: FetchApi;
      identityApi: IdentityApi;
    },
  ) {}

  async *submitPrd(input: StartPrdInput): AsyncGenerator<AiRunEvent> {
    const request: PrdRequest = { version: 1, source: 'manual', ...input };
    yield* this.read(
      await this.fetchStream(`agents/${SCAFFOLDER_PRD_AGENT_ID}/runs`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(await this.headers()),
        },
        body: JSON.stringify({ input: { query: JSON.stringify(request) } }),
      }),
    );
  }

  async *streamRunEvents(runId: string): AsyncGenerator<AiRunEvent> {
    yield* this.read(
      await this.fetchStream(`runs/${runId}/events`, {
        method: 'GET',
        headers: await this.headers(),
      }),
    );
  }

  private async headers(): Promise<Record<string, string>> {
    const { token } = await this.options.identityApi.getCredentials();
    return token ? { authorization: `Bearer ${token}` } : {};
  }

  private async fetchStream(
    path: string,
    options: RequestInit,
  ): Promise<ReadableStream> {
    if (!this.baseUrl)
      this.baseUrl = await this.options.discoveryApi.getBaseUrl(
        this.options.configApi.getOptionalString('ai.endpointPath') ??
          'ai-core',
      );
    const response = await this.options.fetchApi.fetch(
      `${this.baseUrl}/${path}`,
      options,
    );
    if (!response.ok)
      throw new Error(`Unable to retrieve delivery blueprint from ${path}`);
    if (!response.body)
      throw new Error(`No event stream available from ${path}`);
    return response.body;
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
        const event = this.toEvent(value);
        if (event) yield event;
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

  private toEvent(event: ParsedEvent): AiRunEvent | undefined {
    if (!['step', 'artifact', 'done', 'error'].includes(event.event))
      return undefined;
    try {
      return { type: event.event, data: JSON.parse(event.data) } as AiRunEvent;
    } catch {
      return undefined;
    }
  }
}
