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

/**
 * Non-nullable context carrying cryptographically verified actor authorities.
 */
export type CommandContext = {
  readonly actorIdentity: string; // Validated userEntityRef or system service principal token string
  readonly createdAt: string;     // ISO timestamp sequence marker
  readonly logger: LoggerService;  // Highly contextualized workspace child logger instance
};

/**
 * Unified data container bundling request fragments safely.
 */
export type PackedRequestInput = {
  readonly body: Record<string, unknown>;
  readonly query: Record<string, unknown>;
  readonly params: Record<string, unknown>;
  readonly headers: Record<string, string | string[] | undefined>; // Added for strict perimeter CSRF evaluation
};

export interface Command<TInput, TOutput> {
  execute(input: TInput, context: CommandContext): Promise<TOutput>;
}
