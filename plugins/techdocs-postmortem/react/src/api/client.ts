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
import type { AiRunEvent, PostmortemRequest } from '../@types';
import type { TechdocsPostmortemApi } from './apiRef';

/** Stable AI Core agent ID for postmortem timeline drafting. */
export const TECHDOCS_POSTMORTEM_AGENT_ID = 'techdocs-ai-postmortem';

/** Authenticated SSE client for postmortem draft creation and replay. */
export class TechdocsPostmortemClient implements TechdocsPostmortemApi {
  private baseUrl?: string;

  constructor(
    private readonly options: {
      configApi: ConfigApi;
      discoveryApi: DiscoveryApi;
      fetchApi: FetchApi;
      identityApi: IdentityApi;
    },
  ) {}

  async *startDraft(incidentId: string): AsyncGenerator<AiRunEvent> {
    const request: PostmortemRequest = {
      version: 1,
      source: 'manual',
      incidentId,
    };

    yield* this.read(
      await this.fetchStream(`agents/${TECHDOCS_POSTMORTEM_AGENT_ID}/runs`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(await this.authHeaders()),
        },
        body: JSON.stringify({ input: { query: JSON.stringify(request) } }),
      }),
    );
  }

  async *streamRunEvents(runId: string): AsyncGenerator<AiRunEvent> {
    yield* this.read(
      await this.fetchStream(`runs/${runId}/events`, {
        method: 'GET',
        headers: await this.authHeaders(),
      }),
    );
  }

  private async authHeaders(): Promise<Record<string, string>> {
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
      throw new Error(`Unable to retrieve postmortem draft from ${path}`);

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
        const event = this.toRunEvent(value);
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

  private toRunEvent(event: ParsedEvent): AiRunEvent | undefined {
    if (!['step', 'artifact', 'done', 'error'].includes(event.event))
      return undefined;
    try {
      return { type: event.event, data: JSON.parse(event.data) } as AiRunEvent;
    } catch {
      return event.event === 'error'
        ? {
            type: 'error',
            data: { runId: 'unknown', message: event.data || 'Unknown error' },
          }
        : undefined;
    }
  }
}
