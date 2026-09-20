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
  AgentEvent,
  AgentRunInput,
  CatalogEntityResolver,
  WorkflowContext,
  WorkflowRunner,
} from '@ai-crew-suite/plugin-kernel-node';
import type { TechdocsJanitorConfig } from '../config';
import { janitorReportArtifact } from '../services/JanitorArtifactWriter';
import { detectMarkdown } from './detect';
import type { JanitorReport, JanitorRequest } from './state';

/** Stable workflow ID for deterministic TechDocs auditing. */
export const TECHDOCS_JANITOR_WORKFLOW_ID = 'techdocs-janitor';

const reportStatus = (
  failed: boolean,
  count: number,
): JanitorReport['status'] => {
  if (failed) return 'partial';
  if (count > 0) return 'findings';
  return 'clean';
};

/** Audits explicitly supplied markdown paths against the current catalog owner. */
export class JanitorGraph implements WorkflowRunner {
  readonly id = TECHDOCS_JANITOR_WORKFLOW_ID;

  constructor(
    private readonly config: TechdocsJanitorConfig,
    private readonly resolver: CatalogEntityResolver,
  ) {}

  async *run(
    input: AgentRunInput,
    context: WorkflowContext,
  ): AsyncIterable<AgentEvent> {
    let request: JanitorRequest;

    try {
      const raw = JSON.parse(input.input.query) as Record<string, unknown>;

      if (
        raw.version !== 1 ||
        typeof raw.entityRef !== 'string' ||
        typeof raw.repoUrl !== 'string' ||
        !Array.isArray(raw.paths) ||
        !raw.paths.length
      )
        throw new Error(
          'Request requires version 1, entityRef, repoUrl, and explicit markdown paths',
        );

      request = {
        version: 1,
        source: 'manual',
        entityRef: raw.entityRef,
        repoUrl: raw.repoUrl,
        paths: raw.paths
          .filter(
            (path): path is string =>
              typeof path === 'string' && !path.includes('..'),
          )
          .slice(0, this.config.maxPaths),
        ref: typeof raw.ref === 'string' ? raw.ref : undefined,
      };
    } catch (error) {
      yield {
        type: 'error',
        data: {
          runId: input.runId,
          message: error instanceof Error ? error.message : String(error),
        },
      };

      return;
    }

    let seq = 0;

    const step = (node: string, phase: 'enter' | 'exit'): AgentEvent => ({
      type: 'step',
      data: { runId: input.runId, seq: ++seq, node, phase },
    });

    const summary = await this.resolver.getEntitySummary(request.entityRef);

    const limitations = [
      'Documentation patch generation, validation repair loops, API drift, catalog entity-link resolution, and write delivery are not active in this read-only audit.',
    ];

    if (!summary) {
      yield janitorReportArtifact(input.runId, {
        entityRef: request.entityRef,
        repoUrl: request.repoUrl,
        ref: request.ref,
        status: 'partial',
        discrepancies: [],
        limitations: [...limitations, 'Catalog entity was unavailable.'],
        evidence: [],
      });

      yield { type: 'done', data: { runId: input.runId } };

      return;
    }

    const evidence: JanitorReport['evidence'] = [
      {
        id: 'cat-1',
        source: 'catalog',
        summary: `Catalog owner: ${summary.owner ?? 'unassigned'}`,
        reference: summary.ref,
      },
    ];

    const discrepancies = [];

    let failed = false;

    for (const path of request.paths) {
      yield step('load.markdown', 'enter');

      try {
        const result = await context.invokeTool<
          { repoUrl: string; path: string; ref?: string },
          { content: string }
        >({
          toolId: 'vcs.repository.read_file',
          args: { repoUrl: request.repoUrl, path, ref: request.ref },
          limits: { timeoutMs: 10_000 },
        });

        const content = result.output.content.slice(
          0,
          this.config.maxFileBytes,
        );

        evidence.push({
          id: `doc-${evidence.length}`,
          source: 'markdown',
          summary: `Read ${path}`,
          reference: request.repoUrl,
        });

        discrepancies.push(
          ...detectMarkdown({ path, content, owner: summary.owner }),
        );
      } catch {
        failed = true;
        limitations.push(`Markdown file ${path} was unavailable.`);
      }

      yield step('load.markdown', 'exit');
    }

    const report: JanitorReport = {
      entityRef: request.entityRef,
      repoUrl: request.repoUrl,
      ref: request.ref,
      status: reportStatus(failed, discrepancies.length),
      discrepancies,
      limitations,
      evidence,
    };

    yield janitorReportArtifact(input.runId, report);
    yield { type: 'done', data: { runId: input.runId } };
  }
}
