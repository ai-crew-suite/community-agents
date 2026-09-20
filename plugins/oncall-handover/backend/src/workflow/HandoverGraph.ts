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
  WorkflowContext,
  WorkflowRunner,
} from '@ai-crew-suite/plugin-kernel-node';
import { HandoverToolRunner } from '../services/HandoverToolRunner';
import { createHandoverBriefArtifactEvent } from '../services/HandoverArtifactWriter';
import { RunbookRetriever } from '../retrieval/RunbookRetriever';
import { collectSignals } from './collectors';
import { clusterSignals } from './clustering';
import { buildHandoverBrief } from './brief';
import { parseHandoverQuery, HandoverRequestValidationError } from './request';
import { resolveWindow } from './window';

/** Stable workflow identifier for shift handover aggregation. */
export const ONCALL_HANDOVER_WORKFLOW_ID = 'oncall-handover';

/** Configurable graph limits, injectable for deterministic tests. */
export type HandoverGraphOptions = {
  windowHours: number;
  maxWindowHours: number;
  maxSignalsPerSource: number;
  maxClusters: number;
  maxEnrichedClusters: number;
  maxToolInvocations: number;
  now?: () => Date;
};

/** Read-only aggregation graph: collect, cluster, enrich, summarize deterministically, finalize. */
export class HandoverGraph implements WorkflowRunner {
  readonly id = ONCALL_HANDOVER_WORKFLOW_ID;

  constructor(private readonly options: HandoverGraphOptions) {}

  async *run(input: AgentRunInput, context: WorkflowContext): AsyncIterable<AgentEvent> {
    let seq = 0;
    const step = (node: string, phase: 'enter' | 'exit'): AgentEvent => ({
      type: 'step',
      data: { runId: input.runId, seq: ++seq, node, phase },
    });

    yield step('window.resolve', 'enter');
    let request;
    let window;

    try {
      request = parseHandoverQuery(input.input.query, input.trigger ? 'scheduler' : 'manual');
      window = resolveWindow(request, {
        defaultHours: this.options.windowHours,
        maxHours: this.options.maxWindowHours,
        now: this.options.now,
      });
    } catch (error) {
      const message =
        error instanceof HandoverRequestValidationError || error instanceof Error
          ? error.message
          : String(error);

      yield { type: 'error', data: { runId: input.runId, message } };
      return;
    }

    const limitations: string[] = [];
    if (window.clamped) {
      limitations.push(`Window was clamped to ${window.hours} hour(s).`);
    }
    yield step('window.resolve', 'exit');

    const tools = new HandoverToolRunner(context, {
      maxInvocations: this.options.maxToolInvocations,
    });

    yield step('collect.parallel', 'enter');
    const signals = yield* collectSignals({
      runId: input.runId,
      team: request.team,
      entityRefs: request.entityRefs,
      window,
      tools,
      maxSignalsPerSource: this.options.maxSignalsPerSource,
    });
    yield step('collect.parallel', 'exit');

    yield step('cluster.analyze', 'enter');
    const clusters = clusterSignals(signals, this.options.maxClusters);
    yield step('cluster.analyze', 'exit');

    yield step('context.enrich', 'enter');
    const runbooks = await new RunbookRetriever(
      context,
      this.options.maxEnrichedClusters
    ).retrieve(clusters);
    signals.push(...runbooks);
    yield step('context.enrich', 'exit');

    limitations.push(...tools.limitations);

    yield step('brief.summarize', 'enter');
    const brief = buildHandoverBrief({ request, window, signals, clusters, limitations });
    yield step('brief.summarize', 'exit');

    yield step('brief.finalize', 'enter');
    yield createHandoverBriefArtifactEvent(input.runId, brief);
    yield step('brief.finalize', 'exit');

    yield { type: 'done', data: { runId: input.runId } };
  }
}
