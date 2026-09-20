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
  CloudResourceSummary,
  WorkflowContext,
  WorkflowRunner,
} from '@ai-crew-suite/plugin-kernel-node';
import type { ShadowDetectiveConfig } from '../config';
import { shadowResourceReportArtifact } from '../services/ShadowArtifactWriter';
import type { CatalogBindingIndex } from '../services/CatalogBindingIndex';
import { claimLink } from './claimLink';
import { inferOwnership } from './ownership';
import { reconcileAssets } from './reconcile';
import type {
  CloudAsset,
  ShadowScanRequest,
  ShadowResourceReport,
} from './state';

/** Stable workflow identifier for report-only cloud-to-catalog reconciliation. */
export const SHADOW_RECONCILIATION_WORKFLOW_ID = 'shadow-reconciliation';

const reportStatus = (
  truncated: boolean,
  orphanCount: number,
): ShadowResourceReport['status'] => {
  if (truncated) return 'truncated';
  if (orphanCount > 0) return 'report_only';

  return 'no_orphans';
};

/** Parses one bounded, manually initiated cloud inventory request. */
const parseRequest = (query: string): ShadowScanRequest => {
  const raw = JSON.parse(query) as Record<string, unknown>;

  if (raw.version !== 1 || raw.source !== 'manual')
    throw new Error('Request requires version 1 and source manual');

  return {
    version: 1,
    source: 'manual',
    provider: typeof raw.provider === 'string' ? raw.provider : undefined,
    service: typeof raw.service === 'string' ? raw.service : undefined,
  };
};

/** Reconciles invokable cloud inventory against exact catalog bindings without outreach or writes. */
export class ReconciliationGraph implements WorkflowRunner {
  readonly id = SHADOW_RECONCILIATION_WORKFLOW_ID;

  constructor(
    private readonly config: ShadowDetectiveConfig,
    private readonly catalog: CatalogBindingIndex,
  ) {}

  async *run(
    input: AgentRunInput,
    context: WorkflowContext,
  ): AsyncIterable<AgentEvent> {
    let request: ShadowScanRequest;

    try {
      request = parseRequest(input.input.query);
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

    yield step('inventory', 'enter');

    let resources: CloudResourceSummary[];

    try {
      resources = (
        await context.invokeTool<{ service?: string }, CloudResourceSummary[]>({
          toolId: 'cloud.resource.lookup',
          args: { service: request.service },
          limits: { timeoutMs: 15_000, maxInvocations: 1 },
        })
      ).output;
    } catch (error) {
      yield shadowResourceReportArtifact(input.runId, {
        providers: request.provider ? [request.provider] : [],
        scanned: 0,
        registered: 0,
        orphans: [],
        suppressedCount: 0,
        status: 'partial',
        limitations: [
          `Cloud inventory unavailable: ${error instanceof Error ? error.message : String(error)}`,
        ],
        evidence: [],
      });

      yield { type: 'done', data: { runId: input.runId } };

      return;
    }

    yield step('inventory', 'exit');

    const limited = resources.slice(0, this.config.maxResources);

    yield step('reconcile', 'enter');

    const bindings = await this.catalog.load();

    const assets: CloudAsset[] = limited.map((resource, index) => ({
      ...resource,
      evidence: [`asset-${index + 1}`],
    }));

    const partition = reconcileAssets(assets, bindings.registeredIds);

    yield step('reconcile', 'exit');
    yield step('infer', 'enter');

    const baseUrl = this.config.claimBaseUrl ?? 'http://localhost:3000';

    const orphans = partition.orphans.map(asset => {
      const hypotheses = inferOwnership(
        asset,
        this.config.ownerTagKeys,
        bindings.groups,
      );
      return {
        asset,
        fingerprint: `${asset.provider}:${asset.type}:${asset.id}`,
        hypotheses,
        confidence: hypotheses.length
          ? ('high' as const)
          : ('unknown' as const),
        claimUrl: claimLink(baseUrl, this.config.claimTemplateRef, asset),
        rationale: hypotheses.length
          ? `Owner tag resolves to ${hypotheses[0].groupRef}.`
          : 'No catalog-resolved ownership evidence is available.',
      };
    });

    yield step('infer', 'exit');

    const truncated = resources.length > limited.length;

    const report: ShadowResourceReport = {
      providers: [...new Set(limited.map(resource => resource.provider))],
      scanned: limited.length,
      registered: partition.registered.length,
      orphans,
      suppressedCount: 0,
      status: reportStatus(truncated, orphans.length),
      limitations: [
        'Cursor resumption, dedupe, scheduled scans, creator/billing ownership inference, and approval-gated outreach are not active in this report-only milestone.',
        ...(truncated
          ? [`Inventory was capped at ${this.config.maxResources} resources.`]
          : []),
      ],
      evidence: assets.map(asset => ({
        id: asset.evidence[0],
        source: 'cloud',
        summary: `${asset.provider} ${asset.type}`,
        reference: asset.id,
      })),
    };

    yield shadowResourceReportArtifact(input.runId, report);
    yield { type: 'done', data: { runId: input.runId } };
  }
}
