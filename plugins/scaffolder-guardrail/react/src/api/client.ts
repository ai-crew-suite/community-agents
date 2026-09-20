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
import type { ScaffolderGuardrailApi } from './apiRef';
import type {
  AiRunEvent,
  ApprovalDecision,
  EvaluateRequestInput,
  GuardrailRequest
} from '../@types';

/** Stable AI Core agent ID for guardrail evaluation. */
export const SCAFFOLDER_GUARDRAIL_AGENT_ID = 'scaffolder-ai-guardrail-agent';

/** HTTP/SSE implementation of the advisory guardrail API. */
export class ScaffolderGuardrailClient implements ScaffolderGuardrailApi {
  private baseUrl?: string;

  constructor(
    private readonly options: {
      configApi: ConfigApi;
      discoveryApi: DiscoveryApi;
      fetchApi: FetchApi;
      identityApi: IdentityApi
    }
  ) {}

  /** Starts an advisory evaluation and streams back timeline execution steps. */
  async *evaluateRequest(input: EvaluateRequestInput): AsyncGenerator<AiRunEvent> {
    const request: GuardrailRequest = { version: 1, source: 'manual', ...input };

    yield* this.read(
      await this.stream(`agents/${SCAFFOLDER_GUARDRAIL_AGENT_ID}/runs`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(await this.headers())
        },
        body: JSON.stringify({ input: { query: JSON.stringify(request) } })
      })
    );
  }

  /** Streams historical run data, optionally starting after an event checkpoint ID. */
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

  /** Submits an approval or rejection payload to resolve a pending negotiation step. */
  async *submitApproval(runId: string, decision: ApprovalDecision): AsyncGenerator<AiRunEvent> {
    yield* this.read(
      await this.stream(`runs/${runId}/approvals`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(await this.headers())
        },
        body: JSON.stringify(decision)
      })
    );
  }

  /** Extracts and formats standard user bearer authorization credentials. */
  private async headers(): Promise<Record<string, string>> {
    const { token } = await this.options.identityApi.getCredentials();
    return token ? { authorization: `Bearer ${token}` } : {};
  }

  /** Discovers the destination route path and requests an active network data stream response. */
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

  /** Pipes an active chunk stream reader across custom decoder and string-parser layers. */
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

  /** Unpacks a single server-sent data token message payload into a validated runtime object structure. */
  private event(event: ParsedEvent): AiRunEvent | undefined {
    const validTypes = [
      'step',
      'tool_call',
      'tool_result',
      'approval_request',
      'artifact',
      'done',
      'error'
    ];

    if (!validTypes.includes(event.event)) return undefined;

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
