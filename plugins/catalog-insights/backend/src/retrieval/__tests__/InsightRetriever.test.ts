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
import type { WorkflowContext } from '@ai-crew-suite/plugin-kernel-node';
import { describe, expect, it, vi } from 'vitest';
import { InsightRetriever } from '../InsightRetriever';
import type { CatalogInsightRequest } from '../../workflow/state';

const request: CatalogInsightRequest = {
  version: 1,
  entityRef: 'component:default/payment-gateway',
  question: 'Where are the runbooks?',
  source: 'manual',
};

const createContext = (
  output: unknown,
): WorkflowContext & { invokeTool: ReturnType<typeof vi.fn> } =>
  ({
    logger: { warn: vi.fn() },
    invokeTool: vi.fn(async () => {
      if (output instanceof Error) {
        throw output;
      }
      return { toolId: 'knowledge.retrieve', output, summary: 'ok' };
    }),
  } as never);

describe('InsightRetriever', () => {
  it('maps retrieved docs into capped knowledge context items', async () => {
    const docs = Array.from({ length: 10 }, (_, i) => ({
      metadata: { title: `doc-${i}`, url: `https://example.com/${i}` },
      content: `chunk ${i}`,
    }));
    const context = createContext(docs);
    const retriever = new InsightRetriever(context, { maxChunks: 3 });

    const items = await retriever.retrieve({
      request,
      entityName: 'payment-gateway',
      entityType: 'service',
    });

    expect(items).toHaveLength(3);
    expect(items[0]).toEqual({
      id: 'knowledge:component:default/payment-gateway:0',
      source: 'knowledge',
      kind: 'doc-chunk',
      summary: 'chunk 0',
      reference: 'https://example.com/0',
    });
  });

  it('scopes the retrieval query with the entity filter and name', async () => {
    const context = createContext([]);
    const retriever = new InsightRetriever(context, { maxChunks: 6 });

    await retriever.retrieve({ request, entityName: 'payment-gateway' });

    expect(context.invokeTool).toHaveBeenCalledWith(
      expect.objectContaining({
        toolId: 'knowledge.retrieve',
        args: expect.objectContaining({
          query: expect.stringContaining('payment-gateway'),
          entityFilter: [
            { 'metadata.entityRef': 'component:default/payment-gateway' },
          ],
        }),
      }),
    );
  });

  it('returns an empty bundle when retrieval fails', async () => {
    const context = createContext(new Error('vector store unavailable'));
    const retriever = new InsightRetriever(context, { maxChunks: 6 });

    const items = await retriever.retrieve({ request, entityName: 'x' });

    expect(items).toEqual([]);
    expect(context.logger.warn).toHaveBeenCalled();
  });

  it('returns an empty bundle for non-array tool output', async () => {
    const context = createContext({ not: 'an array' });
    const retriever = new InsightRetriever(context, { maxChunks: 6 });

    expect(await retriever.retrieve({ request, entityName: 'x' })).toEqual([]);
  });
});
