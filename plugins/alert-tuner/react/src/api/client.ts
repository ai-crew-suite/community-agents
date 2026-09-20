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
import type { AlertTunerApi } from './apiRef';
import type {
  AiRunEvent,
  AlertTuningRequest,
  ApprovalDecision,
  EvaluateAlertInput
} from '../@types';

/** Stable AI Core agent identifier for alert tuning evaluations. */
export const ALERT_TUNER_AGENT_ID = 'alert-ai-tuner';

/** HTTP/SSE implementation for alert evaluation, event replay, and future approval. */
export class AlertTunerClient implements AlertTunerApi {
  private baseUrl?: string;

  constructor(
    private readonly options: {
      configApi: ConfigApi;
      discoveryApi: DiscoveryApi;
      fetchApi: FetchApi;
      identityApi: IdentityApi
    }
  ) {}

  async *evaluateAlert(input: EvaluateAlertInput): AsyncGenerator<AiRunEvent> {
    const request: AlertTuningRequest = { version: 1, source: 'manual', ...input };

    yield* this.read(
      await this.fetchStream(`agents/${ALERT_TUNER_AGENT_ID}/runs`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(await this.authHeaders())
        },
        body: JSON.stringify({ input: { query: JSON.stringify(request) } }),
      })
    );
  }

  async *streamRunEvents(runId: string, lastEventId?: number): AsyncGenerator<AiRunEvent> {
    yield* this.read(
      await this.fetchStream(`runs/${runId}/events`, {
        method: 'GET',
        headers: {
          ...(await this.authHeaders()),
          ...(lastEventId === undefined ? {} : { 'Last-Event-ID': String(lastEventId) }),
        },
      })
    );
  }

  async *submitApproval(runId: string, decision: ApprovalDecision): AsyncGenerator<AiRunEvent> {
    yield* this.read(
      await this.fetchStream(`runs/${runId}/approvals`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(await this.authHeaders())
        },
        body: JSON.stringify(decision),
      })
    );
  }

  private async authHeaders(): Promise<Record<string, string>> {
    const { token } = await this.options.identityApi.getCredentials();
    return token ? { authorization: `Bearer ${token}` } : {};
  }

  private async getBaseUrl(): Promise<string> {
    if (!this.baseUrl) {
      this.baseUrl = await this.options.discoveryApi.getBaseUrl(
        this.options.configApi.getOptionalString('ai.endpointPath') ?? 'ai-core'
      );
    }
    return this.baseUrl;
  }

  private async fetchStream(path: string, options: RequestInit): Promise<ReadableStream> {
    const response = await this.options.fetchApi.fetch(
      `${await this.getBaseUrl()}/${path}`,
      options
    );

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
        if (done) return;

        const event = this.toRunEvent(value);
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

  private toRunEvent(event: ParsedEvent): AiRunEvent | undefined {
    const allowedTypes: (string | undefined)[] = [
      'step',
      'tool_call',
      'tool_result',
      'approval_request',
      'artifact',
      'done',
      'error'
    ];
    if (!allowedTypes.includes(event.event)) return undefined;

    try {
      return {
        type: event.event,
        data: JSON.parse(event.data ?? '{}'),
      } as AiRunEvent;
    } catch {
      return event.event === 'error'
        ? {
            type: 'error',
            data: {
              runId: 'unknown',
              message: event.data || 'Unknown error'
            }
          }
        : undefined;
    }
  }
}
