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
import { createApiRef } from '@backstage/core-plugin-api';
import type { AiRunEvent, PreviewGenerationInput } from '../@types';

/** Typed API for non-writing infrastructure preview and replay. */
export interface ScaffolderInfraApi {
  /** Initiates an in-memory infrastructure generation check and streams back execution lifecycle events. */
  previewGeneration(input: PreviewGenerationInput): AsyncGenerator<AiRunEvent>;

  /** Streams historical execution timeline events, optionally starting from a specific tracking milestone checkpoint index. */
  streamRunEvents(runId: string, lastEventId?: number): AsyncGenerator<AiRunEvent>;
}

/** Backstage API ref consumed by the infrastructure preview hook. */
export const scaffolderInfraApiRef = createApiRef<ScaffolderInfraApi>({
  id: 'plugin.scaffolder-ai-infra.api'
});
