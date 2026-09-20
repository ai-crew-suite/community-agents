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
  RepositorySearchResult,
  WorkflowContext,
  WorkflowRunner,
} from '@ai-crew-suite/plugin-kernel-node';
import type { SearchContextConfig } from '../config';
import { classifyConsumer } from '../rules/classify';
import { rollupOwners } from '../rules/rollup';
import { impactAssessmentArtifact } from '../services/ImpactArtifactWriter';
import { ImpactRequestValidationError, parseImpactQuery } from './request';
import type { CodeMatch, DependencyNode, ImpactAssessment } from './state';

/** Stable workflow ID for bounded catalog-to-code impact analysis. */
export const CROSS_SERVICE_IMPACT_WORKFLOW_ID = 'cross-service-impact';

const providerFor = (repo: string) => {
  try {
    const host = new URL(repo).hostname;
    if (host.includes('github')) return 'github';
    if (host.includes('gitlab')) return 'gitlab';
    if (host.includes('azure')) return 'azuredevops';
    return host;
  } catch {
    return 'unknown';
  }
};

const assessmentStatus = (
  consumerCount: number,
  graphTruncated: boolean,
  unknownCount: number,
): ImpactAssessment['status'] => {
  if (consumerCount === 0) return 'no_consumers';
  if (graphTruncated || unknownCount > 0) return 'partial';

  return 'complete';
};

/** Deterministic read-only impact workflow; unknown is never reported as unaffected. */
export class ImpactGraph implements WorkflowRunner {
  readonly id = CROSS_SERVICE_IMPACT_WORKFLOW_ID;

  constructor(
    private readonly config: SearchContextConfig,
    private readonly resolver: CatalogEntityResolver,
  ) {}

  async *run(
    input: AgentRunInput,
    context: WorkflowContext,
  ): AsyncIterable<AgentEvent> {
    let request;

    try {
      request = parseImpactQuery(input.input.query, this.config.maxDepth);
    } catch (error) {
      yield {
        type: 'error',
        data: {
          runId: input.runId,
          message:
            error instanceof ImpactRequestValidationError ||
            error instanceof Error
              ? error.message
              : String(error),
        },
      };

      return;
    }

    let seq = 0;

    const step = (node: string, phase: 'enter' | 'exit'): AgentEvent => ({
      type: 'step',
      data: { runId: input.runId, seq: ++seq, node, phase },
    });

    yield step('scope', 'enter');

    if (!(await this.resolver.getEntitySummary(request.entityRef))) {
      yield impactAssessmentArtifact(input.runId, {
        entityRef: request.entityRef,
        change: request.change,
        status: 'out_of_scope',
        graphTruncated: false,
        consumers: [],
        counts: { impacted: 0, unaffected: 0, unknown: 0 },
        ownerRollups: [],
        limitations: [
          'The requested source entity is unavailable or not readable.',
        ],
      });

      yield { type: 'done', data: { runId: input.runId } };

      return;
    }

    yield step('scope', 'exit');
    yield step('crawl', 'enter');

    const graph = await this.resolver.getRelations({
      entityRef: request.entityRef,
      relationTypes: request.relationTypes ?? [
        'dependsOn',
        'dependencyOf',
        'providesApi',
        'apiConsumedBy',
      ],
      maxDepth: request.maxDepth ?? this.config.maxDepth,
      limit: this.config.maxConsumers + 1,
    });

    const nodes: DependencyNode[] = Object.keys(graph.entities)
      .filter(ref => ref !== request.entityRef)
      .slice(0, this.config.maxConsumers)
      .map((ref, index) => ({
        ref,
        owner: graph.entities[ref].owner,
        hop: 1,
        viaRelation:
          graph.relations.find(edge => edge.targetRef === ref)?.type ??
          'catalog_relation',
        relationId: `dep-${index + 1}`,
      }));

    yield step('crawl', 'exit');

    const impacts = [];

    const limitations: string[] = graph.truncated
      ? ['Catalog traversal reached its configured depth or consumer limit.']
      : [];

    for (const node of nodes) {
      yield step('validate', 'enter');

      const integrations = await this.resolver.getIntegrationReferences(
        node.ref,
      );

      const repoUrl = integrations.repositories[0];

      const capable =
        !!repoUrl &&
        this.config.capableProviders.includes(providerFor(repoUrl));

      let failed = false;

      const matches: CodeMatch[] = [];

      if (repoUrl && capable)
        try {
          const output = await context.invokeTool<
            { repoUrl: string; query: string },
            RepositorySearchResult[]
          >({
            toolId: 'vcs.repository.search',
            args: { repoUrl, query: request.change.symbol },
            limits: {
              timeoutMs: 10_000,
              maxInvocations: this.config.maxToolInvocations,
            },
          });

          output.output
            .slice(0, 5)
            .forEach((item, index) =>
              matches.push({
                id: `match-${index + 1}`,
                repoUrl,
                path: item.path,
                line: item.line,
                snippet: item.snippet?.slice(0, 500),
                ref: item.ref,
                query: request.change.symbol,
              }),
            );
        } catch {
          failed = true;
          limitations.push(`Repository search failed for ${node.ref}.`);
        }

      impacts.push(
        classifyConsumer({
          node,
          repoUrl,
          capable,
          failed,
          matches,
          change: request.change,
        }),
      );

      yield step('validate', 'exit');
    }

    const counts = {
      impacted: impacts.filter(item => item.classification === 'impacted').length,
      unaffected: impacts.filter(item => item.classification === 'unaffected').length,
      unknown: impacts.filter(item => item.classification === 'unknown').length,
    };

    const assessment: ImpactAssessment = {
      entityRef: request.entityRef,
      change: request.change,
      status: assessmentStatus(nodes.length, graph.truncated, counts.unknown),
      graphTruncated: graph.truncated,
      consumers: impacts,
      counts,
      ownerRollups: rollupOwners(impacts),
      limitations,
    };

    yield impactAssessmentArtifact(input.runId, assessment);
    yield { type: 'done', data: { runId: input.runId } };
  }
}
