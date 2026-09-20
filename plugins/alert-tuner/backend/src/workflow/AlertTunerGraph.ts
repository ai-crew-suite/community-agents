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
import { BaseGraphRunner } from '@ai-crew-suite/plugin-kernel-node';
import type {
  AgentEvent,
  AgentRunInput,
  WorkflowContext,
} from '@ai-crew-suite/plugin-kernel-node';
import type { AlertAiTunerConfig } from '../config';
import {
  applySuppression,
  toSuppressionWindows,
} from './correlate';
import {
  toFiringEvidence,
  toFiringSamples,
} from './history';
import { scoreNoise } from './noise';
import {
  buildTuningProposal,
  deriveConfidence,
  statusForVerdict,
} from './proposal';
import {
  parseAlertTuningQuery,
  resolveWindow,
} from './request';
import { proposePatch } from './pipeline';
import { AlertTunerInputSchema, AlertTunerInput } from '../schema';
import type { EvidenceRef } from './state';
import { AlertHistoryReader } from '../services/AlertHistoryReader';
import { TunerToolRunner } from '../services/TunerToolRunner';
import { createTuningProposalArtifactEvent } from '../services/TunerArtifactWriter';

/** Stable custom workflow identifier for alert threshold tuning. */
export const ALERT_TUNING_WORKFLOW_ID = 'alert-tuning';

/** Tool ID consulted to rule out genuine incidents. */
const INCIDENT_LIST_TOOL_ID = 'incident.incident.list';

/** Limitation recorded because the shared deploy-timeline diagnostics are unbuilt. */
export const DEPLOY_TIMELINE_LIMITATION =
  'Deploy and scaling correlation is unavailable until the shared Kubernetes workload ' +
  'timeline diagnostics are registered.';

/** Limitation recorded because no VCS write tool exists to open a tuning PR. */
export const PUBLISH_LIMITATION =
  'Pull-request publishing is unavailable: the shared vcs.pull_request.create write tool ' +
  'is not registered, so this proposal is advisory only.';

/** Configurable limits and an injectable clock for deterministic tests. */
export type AlertTunerGraphOptions = AlertAiTunerConfig & { now?: () => Date };

/**
 * Deterministic tuning graph: observe firing history, score noise statistically,
 * suppress real signal, locate the owning IaC assignment, and emit a capped
 * anchored patch proposal.
 *
 * Every decision that can affect infrastructure — the verdict, the new values,
 * and the diff — is computed in pure code, so no model output can reach a patch.
 */
export class AlertTunerGraph extends BaseGraphRunner<typeof AlertTunerInputSchema> {
  readonly id = ALERT_TUNING_WORKFLOW_ID;

  /**
   * @param options - Resolved configuration plus an optional injected clock.
   */
  constructor(private readonly options: AlertTunerGraphOptions) {
    super(AlertTunerInputSchema);
  }

  /**
   * Executes one bounded tuning evaluation.
   */
  protected async *executeGraph(
    requestInput: AlertTunerInput,
    inputEnvelope: AgentRunInput,
    context: WorkflowContext
  ): AsyncIterable<AgentEvent> {
    let seq = 0;
    const step = (node: string, phase: 'enter' | 'exit'): AgentEvent => ({
      type: 'step',
      data: { runId: inputEnvelope.runId, seq: ++seq, node, phase },
    });

    yield step('observe', 'enter');

    const request = parseAlertTuningQuery(
      JSON.stringify(requestInput), 
      inputEnvelope.trigger ? 'scheduler' : 'manual', 
      {
        defaultDays: this.options.windowDays,
        maxDays: this.options.maxWindowDays,
      }
    );

    const window = resolveWindow(request, this.options.now);
    const tools = new TunerToolRunner(context, {
      maxInvocations: this.options.maxToolInvocations,
    });

    const entries = await new AlertHistoryReader(tools, this.options.maxHistoryEntries).read(
      request,
      window
    );

    const samples = toFiringSamples(entries, window, this.options.maxHistoryEntries);
    const evidence: EvidenceRef[] = toFiringEvidence(samples);

    yield {
      type: 'tool_result',
      data: {
        runId: inputEnvelope.runId,
        tool: 'incident.alert.history',
        ok: samples.length > 0,
        summary: `${samples.length} firing(s) in window`,
      },
    };

    yield step('observe', 'exit');

    const limitations = [DEPLOY_TIMELINE_LIMITATION];
    if (this.options.publish.enabled) {
      limitations.push(PUBLISH_LIMITATION);
    }

    if (samples.length < this.options.noise.minSamples) {
      yield createTuningProposalArtifactEvent(
        inputEnvelope.runId,
        buildTuningProposal({
          request,
          window,
          changes: [],
          evidence,
          limitations: [
            ...limitations,
            ...tools.limitations,
            `Only ${samples.length} firing(s) were observed; ` +
              `${this.options.noise.minSamples} are required to score noise.`,
          ],
          status: 'insufficient_evidence',
          confidence: 'low',
        })
      );

      yield { type: 'done', data: { runId: inputEnvelope.runId } };

      return;
    }

    yield step('analyze', 'enter');

    const baseScore = scoreNoise(samples, this.options.noise);

    yield step('analyze', 'exit');

    yield step('correlate', 'enter');

    const incidents = await tools.invoke<
      { service?: string; since: string; until: string; limit: number },
      unknown
    >(INCIDENT_LIST_TOOL_ID, {
      service: request.service,
      since: window.from,
      until: window.to,
      limit: this.options.maxHistoryEntries,
    });

    const correlation = toSuppressionWindows(incidents?.output, {
      prefix: 'inc',
      source: 'incident',
      max: this.options.maxHistoryEntries,
    });

    evidence.push(...correlation.evidence);

    const score = applySuppression(
      baseScore,
      samples,
      correlation.windows,
      this.options.noise.correlationWindowMinutes
    );

    yield step('correlate', 'exit');

    if (score.verdict !== 'noisy') {
      yield createTuningProposalArtifactEvent(
        inputEnvelope.runId,
        buildTuningProposal({
          request,
          window,
          score,
          changes: [],
          evidence,
          limitations: [...limitations, ...tools.limitations],
          status: statusForVerdict(score.verdict, false),
          confidence: deriveConfidence({ score, hasMetrics: false, hasDeployTimeline: false }),
        })
      );

      yield { type: 'done', data: { runId: inputEnvelope.runId } };

      return;
    }

    yield step('locate', 'enter');

    const proposal = await proposePatch({
      request,
      window,
      score,
      evidence,
      limitations,
      tools,
      config: this.options,
    });

    yield step('locate', 'exit');

    yield createTuningProposalArtifactEvent(inputEnvelope.runId, proposal);

    yield { type: 'done', data: { runId: inputEnvelope.runId } };
  }
}
