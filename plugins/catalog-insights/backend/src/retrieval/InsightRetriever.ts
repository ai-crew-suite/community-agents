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
import type {
  EmbeddingDoc,
  WorkflowContext,
} from '@ai-crew-suite/plugin-kernel-node';
import type { RawContextItem } from '../workflow/context';
import type { CatalogInsightRequest } from '../workflow/state';

/**
 * Thin wrapper over the existing `knowledge.retrieve` tool. This is the only
 * RAG entry point for the insights graph: it builds the retrieval query,
 * scopes it to the target entity via `entityFilter`, caps the chunk count,
 * and maps retrieved documents into `knowledge`-sourced context items.
 */
export class InsightRetriever {
  constructor(
    private readonly context: WorkflowContext,
    private readonly options: {
      /** Maximum retrieved chunks retained per run. */
      maxChunks: number;
    },
  ) {}

  /**
   * Retrieves catalog/TechDocs documentation relevant to the question and
   * entity. Returns an empty bundle (never throws) when retrieval is
   * unavailable — a retrieval miss must not fail an insight run.
   */
  async retrieve(input: {
    request: CatalogInsightRequest;
    entityName: string;
    entityType?: string;
  }): Promise<RawContextItem[]> {
    const { request, entityName, entityType } = input;
    const query = entityType
      ? `${request.question} (${entityType} ${entityName})`
      : `${request.question} (${entityName})`;

    // The retrieval tool accepts the same { query, source, entityFilter }
    // shape the built-in orchestrators use; the entity filter scopes chunks
    // to the target entity where the pipeline supports it.
    const args = {
      query,
      source: 'catalog',
      entityFilter: [
        {
          'metadata.entityRef': request.entityRef,
        },
      ],
    };

    let result;
    try {
      result = await this.context.invokeTool<typeof args, EmbeddingDoc[]>({
        toolId: 'knowledge.retrieve',
        args,
        limits: { timeoutMs: 10_000 },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.context.logger.warn('knowledge.retrieve failed for insight run', {
        error: message,
      });
      return [];
    }

    const docs = result.output;
    if (!Array.isArray(docs)) {
      return [];
    }

    return docs.slice(0, this.options.maxChunks).map((doc, index) => ({
      id: `knowledge:${request.entityRef}:${index}`,
      source: 'knowledge' as const,
      kind: 'doc-chunk',
      summary: doc.content,
      reference: doc.metadata?.url ?? doc.metadata?.title,
    }));
  }
}
