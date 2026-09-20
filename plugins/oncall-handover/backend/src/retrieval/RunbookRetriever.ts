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
import type { IncidentCluster, RawSignal } from '../workflow/state';

/**
 * Retrieves capped runbook snippets for the highest-risk incident clusters.
 * Leverages the internal vector search tool to gather relevant knowledge base references.
 */
export class RunbookRetriever {
  /**
   * Creates an instance of RunbookRetriever.
   *
   * @param context - The execution context provided by the workflow engine.
   * @param maxClusters - The upper bound limit for processing clustered records.
   */
  constructor(
    private readonly context: WorkflowContext,
    private readonly maxClusters: number
  ) {}

  /**
   * Queries the knowledge catalog tool for documented procedures tied to the incident headers.
   *
   * @param clusters - Deduplicated incident collections identifying active platform events.
   * @returns A Promise resolving to an array of parsed knowledge RawSignal items.
   */
  async retrieve(clusters: IncidentCluster[]): Promise<RawSignal[]> {
    const signals: RawSignal[] = [];

    for (const cluster of clusters.slice(0, this.maxClusters)) {
      try {
        const result = await this.context.invokeTool<
          { query: string; source: string },
          { content?: string; metadata?: { url?: string } }[]
        >({
          toolId: 'knowledge.retrieve',
          args: {
            query: `${cluster.title} ${cluster.service ?? ''}`,
            source: 'catalog',
          },
          limits: { timeoutMs: 10_000 },
        });

        const outputs = Array.isArray(result.output) ? result.output : [];

        for (const [index, doc] of outputs.slice(0, 3).entries()) {
          signals.push({
            id: `knowledge:${cluster.id}:${index}`,
            source: 'knowledge',
            kind: 'runbook',
            summary: doc.content ?? 'Runbook context',
            service: cluster.service,
            reference: doc.metadata?.url,
          });
        }
      } catch {
        /* Retrieval operations are treated as completely optional fallbacks */
      }
    }

    return signals;
  }
}
