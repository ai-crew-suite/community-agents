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
import { LoggerService } from '@backstage/backend-plugin-api';
import { Response } from 'express';

export type CommandContext = {
  readonly actorIdentity: string;
  readonly createdAt: string;
  readonly logger: LoggerService;
};

export type PackedRequestInput = {
  readonly body: Record<string, unknown>;
  readonly query: Record<string, unknown>;
  readonly params: Record<string, unknown>;
  readonly headers: Record<string, string | string[] | undefined>;
};

export interface FlushingResponse extends Response {
  flush?: () => void;
}

// Unified token representing the lazy handover function for streaming connections
export type StreamExecutionFunction = (res: FlushingResponse) => Promise<void>;

export interface Command<TInput, TOutput> {
  execute(input: TInput, context: CommandContext): Promise<TOutput>;
}
