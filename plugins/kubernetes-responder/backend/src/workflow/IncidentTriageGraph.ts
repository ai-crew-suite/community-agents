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
  KubernetesEventSummary,
  KubernetesPodLogExcerpt,
  KubernetesWorkloadRef,
  KubernetesWorkloadSnapshot,
  KubernetesWorkloadTimeline,
  WorkflowContext,
  WorkflowRunner,
} from '@ai-crew-suite/plugin-kernel-node';
import type { KubernetesAiResponderConfig } from '../config';
import { InvestigationToolRunner } from '../services/InvestigationToolRunner';
import {
  TriggerValidationError,
  parseTriggerQuery,
} from '../triggers/normalizeAlert';
import { normalizeEvidence, redactSensitiveText } from './evidence';
import {
  buildIncidentTriageReport,
  buildSynthesisPrompt,
  parseModelSynthesis,
  type ModelSynthesis,
} from './report';
import {
  classifyFailure,
  deterministicCausesFor,
  evidencePlanFor,
} from './routing';
import type {
  IncidentEvidence,
  InvestigationState,
  KubernetesIncidentTrigger,
} from './state';

/** Stable workflow identifier for the Kubernetes incident triage graph. */
export const KUBERNETES_INCIDENT_TRIAGE_WORKFLOW_ID =
  'kubernetes-incident-triage';

/**
 * Construction options for `IncidentTriageGraph`, derived from the responder
 * config and overridable for tests.
 */

export type IncidentTriageGraphOptions = Pick<
  KubernetesAiResponderConfig,
  'maxEvidenceItems' | 'maxLogBytes'
> & {
  /** Minutes of context gathered before the trigger time. Defaults to 30. */
  lookbackMinutes?: number;
  /** Hard cap on tool invocations per run. Defaults to 12. */
  maxToolInvocations?: number;
  /** Per-tool timeout in milliseconds. Defaults to 10_000. */
  toolTimeoutMs?: number;
  /** Maximum number of containers to pull previous logs for. Defaults to 3. */
  maxLogContainers?: number;
  /** Injectable clock for deterministic tests. */
  now?: () => Date;
};

const incidentWindow = (
  trigger: KubernetesIncidentTrigger,
  lookbackMinutes: number,
) => {
  const occurredAt = Date.parse(trigger.occurredAt);
  const since = new Date(occurredAt - lookbackMinutes * 60_000).toISOString();
  const until = new Date(occurredAt + 15 * 60_000).toISOString();
  return { since, until };
};

const workloadEvidence = (
  snapshot: KubernetesWorkloadSnapshot,
): IncidentEvidence[] => [
  {
    id: `workload:${snapshot.cluster}/${snapshot.namespace}/${snapshot.name}`,
    source: 'kubernetes',
    kind: 'workload',
    summary:
      `Workload ${snapshot.kind}/${snapshot.name} in ${snapshot.cluster}/${snapshot.namespace}: ` +
      `${snapshot.pods.length} pod(s), ` +
      `replicas ready=${snapshot.replicas?.ready ?? 'unknown'}/desired=${snapshot.replicas?.desired ?? 'unknown'}`,
    reference: `${snapshot.cluster}/${snapshot.namespace}/${snapshot.kind}/${snapshot.name}`,
    confidence: 'high',
  },
  ...snapshot.pods.flatMap(pod => [
    {
      id: `pod:${pod.cluster}/${pod.namespace}/${pod.name}`,
      source: 'kubernetes' as const,
      kind: 'pod',
      observedAt: pod.startedAt,
      summary: `Pod ${pod.name}: phase=${pod.phase ?? 'Unknown'}; containers: ${pod.containers
        .map(
          container =>
            `${container.name}(${container.state}${container.reason ? `, ${container.reason}` : ''}, restarts=${container.restartCount})`,
        )
        .join('; ')}`,
      reference: `${pod.cluster}/${pod.namespace}/pod/${pod.name}`,
      confidence: 'high' as const,
    },
  ]),
];

const eventEvidence = (events: KubernetesEventSummary[]): IncidentEvidence[] =>
  events.map((event, index) => ({
    id: `event:${event.cluster}/${event.namespace}/${event.involvedObject?.name ?? 'workload'}:${index}`,
    source: 'kubernetes',
    kind: 'event',
    observedAt: event.lastObservedAt ?? event.firstObservedAt,
    summary:
      `${event.type ?? 'Normal'} event${event.reason ? ` ${event.reason}` : ''} on ` +
      `${event.involvedObject?.kind ?? 'object'} ${event.involvedObject?.name ?? 'unknown'}: ` +
      `${event.message}${event.count && event.count > 1 ? ` (x${event.count})` : ''}`,
    confidence: 'medium',
  }));

const logEvidence = (log: KubernetesPodLogExcerpt): IncidentEvidence => ({
  id: `log:${log.cluster}/${log.namespace}/${log.pod}:${log.container ?? 'default'}${log.previous ? ':previous' : ''}`,
  source: 'kubernetes',
  kind: 'log',
  observedAt: log.since,
  summary:
    `${log.previous ? 'Previous ' : ''}logs for ${log.pod}/${log.container ?? 'default'}` +
    `${log.truncated ? ' (truncated)' : ''}: ${log.text.split('\n').slice(0, 3).join(' | ')}`,
  reference: `${log.cluster}/${log.namespace}/pod/${log.pod}`,
  confidence: 'high',
});

const invokeModel = async (
  context: WorkflowContext,
  prompt: string,
): Promise<string> => {
  const result = await context.model.invoke(prompt);
  if (typeof result === 'string') {
    return result;
  }
  const content = (result as { content?: unknown }).content;
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map(part => {
        if (typeof part === 'string') {
          return part;
        }
        const text = (part as { text?: unknown })?.text;
        return typeof text === 'string' ? (part as { text: string }).text : '';
      })
      .join('');
  }
  return String(result);
};

/**
 * Read-only deterministic Kubernetes incident investigation graph.
 *
 * The graph owns investigation order, failure-class routing, evidence policy,
 * and report interpretation. AI Core centrally owns tool allow-list
 * enforcement, bounded execution, identity propagation, run persistence, and
 * auditing. The configured model only synthesizes a cited report from the
 * normalized, redacted evidence bundle; it never selects tools.
 */
export class IncidentTriageGraph implements WorkflowRunner {
  readonly id = KUBERNETES_INCIDENT_TRIAGE_WORKFLOW_ID;

  constructor(private readonly options: IncidentTriageGraphOptions) {}

  async *run(
    input: AgentRunInput,
    context: WorkflowContext,
  ): AsyncIterable<AgentEvent> {
    const now = this.options.now ?? (() => new Date());
    let seq = 0;
    const step = (node: string, phase: 'enter' | 'exit'): AgentEvent => ({
      type: 'step',
      data: { runId: input.runId, seq: ++seq, node, phase },
    });

    const tools = new InvestigationToolRunner(context, {
      maxInvocations: this.options.maxToolInvocations ?? 12,
      timeoutMs: this.options.toolTimeoutMs ?? 10_000,
    });

    // Node: trigger.validate
    yield step('trigger.validate', 'enter');
    let trigger: KubernetesIncidentTrigger;
    try {
      trigger = parseTriggerQuery(input.input.query, {
        defaultSource: input.trigger ? 'scheduler' : 'manual',
        now,
      });
    } catch (error) {
      if (error instanceof TriggerValidationError) {
        yield {
          type: 'error',
          data: { runId: input.runId, message: error.message },
        };
        return;
      }
      throw error;
    }
    const state: InvestigationState = {
      trigger,
      evidence: [],
      limitations: [],
    };
    yield step('trigger.validate', 'exit');

    // Node: workload.resolve
    yield step('workload.resolve', 'enter');
    const workload = yield* this.resolveWorkload(input, state, tools);
    yield step('workload.resolve', 'exit');

    // Node: workload.snapshot
    let snapshot: KubernetesWorkloadSnapshot | undefined;
    if (workload) {
      yield step('workload.snapshot', 'enter');
      yield {
        type: 'tool_call',
        data: {
          runId: input.runId,
          tool: 'kubernetes.workload.get_snapshot',
          args: workload,
        },
      };
      const snapshotResult = await tools.invoke<
        typeof workload,
        KubernetesWorkloadSnapshot
      >('kubernetes.workload.get_snapshot', workload);
      if (snapshotResult) {
        snapshot = snapshotResult.output;
        state.snapshot = snapshot;
        state.evidence.push(...workloadEvidence(snapshot));
        yield {
          type: 'tool_result',
          data: {
            runId: input.runId,
            tool: snapshotResult.toolId,
            ok: true,
            summary: snapshotResult.summary,
          },
        };
      } else {
        yield {
          type: 'tool_result',
          data: {
            runId: input.runId,
            tool: 'kubernetes.workload.get_snapshot',
            ok: false,
            summary: 'snapshot unavailable',
          },
        };
      }
      yield step('workload.snapshot', 'exit');
    }

    // Node: evidence.route
    yield step('evidence.route', 'enter');
    const failureClass = snapshot ? classifyFailure(snapshot) : 'unknown';
    state.failureClass = failureClass;
    const plan = evidencePlanFor(failureClass);
    yield step('evidence.route', 'exit');

    // Node: evidence.collect (routed, bounded diagnostics)
    yield step('evidence.collect', 'enter');
    if (workload) {
      yield* this.collectRoutedEvidence(
        input,
        state,
        workload,
        snapshot,
        plan,
        tools,
      );
    }
    yield step('evidence.collect', 'exit');

    // Node: evidence.normalize
    yield step('evidence.normalize', 'enter');
    const normalized = normalizeEvidence(state.evidence, {
      maxItems: this.options.maxEvidenceItems,
    });
    if (normalized.dropped > 0) {
      state.limitations.push(
        `Evidence bundle was capped: ${normalized.dropped} item(s) dropped to respect the configured limit.`,
      );
    }
    state.evidence = normalized.evidence;
    state.limitations.push(...tools.limitations);
    yield step('evidence.normalize', 'exit');

    // Node: report.synthesize
    yield step('report.synthesize', 'enter');
    const synthesis = yield* this.synthesize(context, state);
    yield step('report.synthesize', 'exit');

    // Node: report.finalize
    yield step('report.finalize', 'enter');
    const report = buildIncidentTriageReport({
      incidentId: trigger.alertId ?? `incident-${input.runId}`,
      trigger,
      failureClass,
      evidence: state.evidence,
      deterministicCauses: deterministicCausesFor(failureClass),
      synthesis,
      limitations: state.limitations,
    });
    yield {
      type: 'artifact',
      data: {
        runId: input.runId,
        kind: 'incident-triage-report',
        ref: JSON.stringify(report),
      },
    };
    yield step('report.finalize', 'exit');
    yield {
      type: 'done',
      data: { runId: input.runId, sessionId: input.input.sessionId },
    };
  }

  /**
   * Resolves the investigation target. Catalog triggers go through
   * `kubernetes.workload.resolve`; coordinate-only triggers skip resolution
   * and address the workload directly.
   */
  private async *resolveWorkload(
    input: AgentRunInput,
    state: InvestigationState,
    tools: InvestigationToolRunner,
  ): AsyncGenerator<AgentEvent, KubernetesWorkloadRef | undefined> {
    const { trigger } = state;

    if (!trigger.entityRef) {
      const direct: KubernetesWorkloadRef = {
        cluster: trigger.cluster!,
        namespace: trigger.namespace!,
        name: trigger.workload!,
        kind: 'Deployment',
      };
      state.workload = direct;
      return direct;
    }

    yield {
      type: 'tool_call',
      data: {
        runId: input.runId,
        tool: 'kubernetes.workload.resolve',
        args: { entityRef: trigger.entityRef },
      },
    };
    const resolved = await tools.invoke<
      { entityRef: string },
      KubernetesWorkloadRef[]
    >('kubernetes.workload.resolve', { entityRef: trigger.entityRef });
    if (!resolved) {
      yield {
        type: 'tool_result',
        data: {
          runId: input.runId,
          tool: 'kubernetes.workload.resolve',
          ok: false,
          summary: 'resolution failed',
        },
      };
      state.limitations.push(
        'No Kubernetes workload could be resolved for the catalog entity.',
      );
      return undefined;
    }
    yield {
      type: 'tool_result',
      data: {
        runId: input.runId,
        tool: resolved.toolId,
        ok: true,
        summary: resolved.summary,
      },
    };

    const matches = resolved.output.filter(
      candidate =>
        (!trigger.cluster || candidate.cluster === trigger.cluster) &&
        (!trigger.namespace || candidate.namespace === trigger.namespace) &&
        (!trigger.workload || candidate.name === trigger.workload),
    );
    const workload = matches[0] ?? resolved.output[0];
    if (!workload) {
      state.limitations.push(
        'No Kubernetes workload could be resolved for the catalog entity.',
      );
      return undefined;
    }
    state.workload = workload;
    return workload;
  }

  /**
   * Collects the bounded, failure-class-specific diagnostic evidence set.
   */
  private async *collectRoutedEvidence(
    input: AgentRunInput,
    state: InvestigationState,
    workload: KubernetesWorkloadRef,
    snapshot: KubernetesWorkloadSnapshot | undefined,
    plan: { previousLogs: boolean; events: boolean; timeline: boolean },
    tools: InvestigationToolRunner,
  ): AsyncGenerator<AgentEvent, void> {
    const { since, until } = incidentWindow(
      state.trigger,
      this.options.lookbackMinutes ?? 30,
    );

    if (plan.previousLogs && snapshot) {
      const candidates = snapshot.pods
        .flatMap(pod =>
          pod.containers
            .filter(
              container =>
                container.state !== 'running' || container.restartCount > 0,
            )
            .map(container => ({ pod, container })),
        )
        .slice(0, this.options.maxLogContainers ?? 3);

      for (const { pod, container } of candidates) {
        const args = {
          cluster: pod.cluster,
          namespace: pod.namespace,
          pod: pod.name,
          container: container.name,
          previous: true,
          since,
          until,
          maxBytes: this.options.maxLogBytes,
        };
        yield {
          type: 'tool_call',
          data: { runId: input.runId, tool: 'kubernetes.pod.get_logs', args },
        };
        const result = await tools.invoke<typeof args, KubernetesPodLogExcerpt>(
          'kubernetes.pod.get_logs',
          args,
        );
        if (result) {
          state.evidence.push(logEvidence(result.output));
          yield {
            type: 'tool_result',
            data: {
              runId: input.runId,
              tool: result.toolId,
              ok: true,
              summary: result.summary,
            },
          };
        } else {
          yield {
            type: 'tool_result',
            data: {
              runId: input.runId,
              tool: 'kubernetes.pod.get_logs',
              ok: false,
              summary: 'logs unavailable',
            },
          };
        }
      }
    }

    if (plan.events) {
      const args = {
        cluster: workload.cluster,
        namespace: workload.namespace,
        workload: workload.name,
        pod: state.trigger.pod,
        since,
        until,
        limit: 50,
      };
      yield {
        type: 'tool_call',
        data: {
          runId: input.runId,
          tool: 'kubernetes.workload.list_events',
          args,
        },
      };
      const result = await tools.invoke<typeof args, KubernetesEventSummary[]>(
        'kubernetes.workload.list_events',
        args,
      );
      if (result) {
        state.evidence.push(...eventEvidence(result.output));
        yield {
          type: 'tool_result',
          data: {
            runId: input.runId,
            tool: result.toolId,
            ok: true,
            summary: result.summary,
          },
        };
      } else {
        yield {
          type: 'tool_result',
          data: {
            runId: input.runId,
            tool: 'kubernetes.workload.list_events',
            ok: false,
            summary: 'events unavailable',
          },
        };
      }
    }

    if (plan.timeline) {
      const args = {
        cluster: workload.cluster,
        namespace: workload.namespace,
        workload: workload.name,
        entityRef: state.trigger.entityRef,
        since,
        until,
        limit: 50,
      };
      yield {
        type: 'tool_call',
        data: {
          runId: input.runId,
          tool: 'kubernetes.workload.get_timeline',
          args,
        },
      };
      const result = await tools.invoke<
        typeof args,
        KubernetesWorkloadTimeline
      >('kubernetes.workload.get_timeline', args);
      if (result) {
        state.evidence.push(...eventEvidence(result.output.events));
        state.evidence.push({
          id: `timeline:${workload.cluster}/${workload.namespace}/${workload.name}`,
          source: 'kubernetes',
          kind: 'timeline',
          observedAt: until,
          summary:
            `Timeline for ${workload.name}: ${result.output.events.length} event(s), ` +
            `${result.output.snapshots.length} workload snapshot(s) between ${since} and ${until}.`,
          confidence: 'medium',
        });
        yield {
          type: 'tool_result',
          data: {
            runId: input.runId,
            tool: result.toolId,
            ok: true,
            summary: result.summary,
          },
        };
      } else {
        yield {
          type: 'tool_result',
          data: {
            runId: input.runId,
            tool: 'kubernetes.workload.get_timeline',
            ok: false,
            summary: 'timeline unavailable',
          },
        };
      }
    }
  }

  /**
   * Runs model synthesis over the normalized evidence bundle. Any failure or
   * schema/citation violation degrades gracefully to deterministic causes and
   * is recorded as a report limitation.
   */
  private async *synthesize(
    context: WorkflowContext,
    state: InvestigationState,
  ): AsyncGenerator<AgentEvent, ModelSynthesis | undefined> {
    if (state.evidence.length === 0) {
      state.limitations.push(
        'Insufficient evidence: no diagnostic observations were collected, so no cause could be supported.',
      );
      return undefined;
    }

    const prompt = buildSynthesisPrompt({
      systemPrompt: context.agent.systemPrompt,
      incidentSummary: state.trigger.summary,
      entityRef: state.trigger.entityRef,
      failureClass: state.failureClass ?? 'unknown',
      evidence: state.evidence,
    });

    let raw: string;
    try {
      raw = redactSensitiveText(await invokeModel(context, prompt));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      context.logger.warn(
        'Model synthesis failed; using deterministic causes',
        {
          error: message,
        },
      );
      state.limitations.push(`Model synthesis unavailable: ${message}`);
      return undefined;
    }

    const synthesis = parseModelSynthesis(
      raw,
      new Set(state.evidence.map(item => item.id)),
    );
    if (!synthesis) {
      state.limitations.push(
        'Model output did not satisfy the report schema; deterministic causes were used instead.',
      );
      return undefined;
    }
    state.limitations.push(...synthesis.limitations);
    return synthesis;
  }
}
