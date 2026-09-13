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

import { vi } from 'vitest';
import type {
  AgentEvent,
  EmbeddingDoc,
  RunRecord,
  RunStore,
  Tool,
  ToolRegistry,
} from '@ai-crew-suite/plugin-kernel-node';

export const createLogger = () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(),
});

export const createAsyncIterable = <T>(items: T[]) =>
  (async function* asyncIterable() {
    for (const item of items) {
      yield item;
    }
  })();

export const collectEvents = async (events: AsyncIterable<AgentEvent>) => {
  const collected: AgentEvent[] = [];
  for await (const event of events) {
    collected.push(event);
  }
  return collected;
};

export const createRunStore = (
  run?: RunRecord,
  overrides: Partial<RunStore> = {},
): RunStore => ({
  createRun: vi.fn(async () => undefined),
  getRun: vi.fn(async () => run),
  findRunByIdempotencyKey: vi.fn(async () => undefined),
  updateRunStatus: vi.fn(async () => undefined),
  appendRunStep: vi.fn(async () => undefined),
  listRunSteps: vi.fn(async () => []),
  createApproval: vi.fn(async () => undefined),
  getPendingApproval: vi.fn(async () => undefined),
  decideApproval: vi.fn(async () => undefined),
  ...overrides,
});

export const defaultEmbeddings: EmbeddingDoc[] = [
  { content: 'owner: platform', metadata: { source: 'catalog' } },
];

export const createRetrievalTool = (output: unknown = defaultEmbeddings): Tool => ({
  id: 'knowledge.retrieve',
  effect: 'read',
  invoke: vi.fn(async () => output),
});

export const createToolRegistry = (tools: Tool[] = []): ToolRegistry => ({
  register: vi.fn(),
  get: vi.fn((id: string) => tools.find(tool => tool.id === id)),
  list: vi.fn(() => tools),
});