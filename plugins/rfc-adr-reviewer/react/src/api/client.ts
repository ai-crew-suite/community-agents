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
import type { RfcAdrReviewerApi } from './apiRef';
import type {
  AiRunEvent,
  ApprovalDecision,
  ReviewRequest,
  StartReviewInput,
} from '../@types';

/** Stable AI Core agent identifier for the RFC/ADR review workflow. */
export const RFC_ADR_REVIEWER_AGENT_ID = 'rfc-adr-ai-reviewer';

/** Run-event types the reviewer UI understands; anything else is ignored. */
const SUPPORTED_EVENT_TYPES = [
  'step',
  'token',
  'tool_call',
  'tool_result',
  'usage',
  'approval_request',
  'artifact',
  'done',
  'error',
];

/**
 * HTTP/SSE client for the RFC/ADR reviewer. Talks to the shared AI Core
 * backend (`ai-core` endpoint by default, overridable through
 * `ai.endpointPath`) and translates the run-event stream into typed
 * `AiRunEvent` values.
 */
export class RfcAdrReviewerClient implements RfcAdrReviewerApi {
  private readonly configApi: ConfigApi;
  private readonly discoveryApi: DiscoveryApi;
  private readonly fetchApi: FetchApi;
  private readonly identityApi: IdentityApi;
  private baseUrl?: string;

  constructor(options: {
    configApi: ConfigApi;
    discoveryApi: DiscoveryApi;
    fetchApi: FetchApi;
    identityApi: IdentityApi;
  }) {
    this.configApi = options.configApi;
    this.discoveryApi = options.discoveryApi;
    this.fetchApi = options.fetchApi;
    this.identityApi = options.identityApi;
  }

  async *startReview(input: StartReviewInput): AsyncGenerator<AiRunEvent> {
    const request: ReviewRequest = { version: 1, source: 'manual', ...input };
    const stream = await this.fetchStream(
      `agents/${RFC_ADR_REVIEWER_AGENT_ID}/runs`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(await this.authHeaders()),
        },
        body: JSON.stringify({ input: { query: JSON.stringify(request) } }),
      },
    );
    yield* this.read(stream);
  }

  async *streamRunEvents(
    runId: string,
    lastEventId?: number,
  ): AsyncGenerator<AiRunEvent> {
    const stream = await this.fetchStream(`runs/${runId}/events`, {
      method: 'GET',
      headers: {
        ...(await this.authHeaders()),
        ...(typeof lastEventId === 'number'
          ? { 'Last-Event-ID': String(lastEventId) }
          : {}),
      },
    });
    yield* this.read(stream);
  }

  async *submitApproval(
    runId: string,
    decision: ApprovalDecision,
  ): AsyncGenerator<AiRunEvent> {
    const stream = await this.fetchStream(`runs/${runId}/approvals`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(await this.authHeaders()),
      },
      body: JSON.stringify(decision),
    });
    yield* this.read(stream);
  }

  private async authHeaders(): Promise<Record<string, string>> {
    const { token } = await this.identityApi.getCredentials();
    return token ? { authorization: `Bearer ${token}` } : {};
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

  private async fetchStream(
    path: string,
    options: RequestInit,
  ): Promise<ReadableStream> {
    const baseUrl = await this.getBaseUrl();
    const response = await this.fetchApi.fetch(`${baseUrl}/${path}`, options);
    if (!response.ok) {
      throw new Error(`Failed to retrieve data from path ${path}`);
    }
    if (!response.body) {
      throw new Error(`No stream available from path ${path}`);
    }
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
        if (done) {
          return;
        }
        const event = this.toRunEvent(value);
        if (event) {
          yield event;
        }
      }
    } catch (error) {
      // A transport failure is surfaced as a terminal run error so callers can
      // fire-and-forget the generator without rejection handling.
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
    if (!SUPPORTED_EVENT_TYPES.includes(event.event ?? '')) {
      return undefined;
    }
    try {
      return {
        type: event.event,
        data: JSON.parse(event.data),
      } as AiRunEvent;
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
