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
  CatalogIntegrationReferences,
  DashboardLink,
  IncidentSummary,
  KubernetesEventSummary,
  KubernetesWorkloadRef,
  KubernetesWorkloadSnapshot,
  KubernetesWorkloadTimeline,
  OnCallShift,
  PullRequestSummary,
} from '@ai-crew-suite/plugin-kernel-node';
import type { InsightToolRunner } from '../services/InsightToolRunner';
import type { RawContextItem } from './context';
import type { IntentToolPlan } from './intents';
import type { InsightIntent, InsightRunState } from './state';

/**
 * Inputs for the context.gather node: the classified intent, its tool plan,
 * the resolved entity's integration handles, and the shared raw bundle.
 */
export type GatherInput = {
  runId: string;
  state: InsightRunState;
  intent: InsightIntent;
  plan: IntentToolPlan;
  references: CatalogIntegrationReferences | undefined;
  raw: RawContextItem[];
  tools: InsightToolRunner;
  now: () => Date;
  lookbackMinutes: number;
  maxLogResults: number;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const actorName = (actor: unknown): string => {
  if (isRecord(actor)) {
    const candidate = actor.name ?? actor.id ?? actor.email;
    if (typeof candidate === 'string' && candidate.length > 0) {
      return candidate;
    }
  }
  return 'unknown responder';
};

const oncallItems = (
  entityRef: string,
  shifts: OnCallShift[],
): RawContextItem[] =>
  shifts.map((shift, index) => ({
    id: `incident:oncall:${entityRef}:${index}`,
    source: 'incident' as const,
    kind: 'oncall',
    observedAt: shift.start,
    summary:
      `On-call: ${actorName(shift.responder)}` +
      `${shift.policyName ? ` via ${shift.policyName}` : ''}` +
      `${shift.start && shift.end ? ` (${shift.start} → ${shift.end})` : ''}`,
  }));

const incidentItems = (
  entityRef: string,
  incidents: IncidentSummary[],
): RawContextItem[] =>
  incidents.map(incident => ({
    id: `incident:incident:${incident.id}`,
    source: 'incident' as const,
    kind: 'incident',
    observedAt: incident.triggeredAt,
    summary:
      `Incident ${incident.title} [${incident.state}` +
      `${incident.severity ? `/${incident.severity}` : ''}]`,
    reference: incident.url,
  }));

const dashboardItems = (
  entityRef: string,
  dashboards: DashboardLink[],
): RawContextItem[] =>
  dashboards.map(dashboard => ({
    id: `observability:dashboard:${dashboard.id}`,
    source: 'observability' as const,
    kind: 'dashboard-link',
    summary: `Dashboard: ${dashboard.title}`,
    reference: dashboard.url,
  }));

const logItems = (
  entityRef: string,
  logs: unknown,
  maxLogResults: number,
): RawContextItem[] => {
  // Log bodies never enter the bundle; only bounded, redacted summaries do.
  if (!Array.isArray(logs)) {
    return [];
  }
  return logs.slice(0, maxLogResults).map((entry, index) => {
    const record = isRecord(entry) ? entry : {};
    const message =
      typeof record.message === 'string'
        ? record.message.slice(0, 200)
        : 'log entry';
    const level = typeof record.level === 'string' ? record.level : 'unknown';
    return {
      id: `observability:log:${entityRef}:${index}`,
      source: 'observability' as const,
      kind: 'log-excerpt',
      observedAt:
        typeof record.timestamp === 'string' ? record.timestamp : undefined,
      summary: `[${level}] ${message}`,
    };
  });
};

const pullRequestItems = (
  entityRef: string,
  pullRequests: PullRequestSummary[],
): RawContextItem[] =>
  pullRequests.map(pr => ({
    id: `vcs:pr:${entityRef}:${pr.number}`,
    source: 'vcs' as const,
    kind: 'pull-request',
    summary:
      `PR #${pr.number} ${pr.title} [${pr.state}]` +
      `${pr.author ? ` by ${pr.author}` : ''}`,
    reference: pr.url,
  }));

const eventItems = (events: KubernetesEventSummary[]): RawContextItem[] =>
  events.map((event, index) => ({
    id: `kubernetes:event:${event.cluster}/${event.namespace}/${index}`,
    source: 'kubernetes' as const,
    kind: 'event',
    observedAt: event.lastObservedAt ?? event.firstObservedAt,
    summary:
      `${event.type ?? 'Normal'} event${event.reason ? ` ${event.reason}` : ''} on ` +
      `${event.involvedObject?.kind ?? 'object'} ${event.involvedObject?.name ?? 'unknown'}: ` +
      `${event.message}${event.count && event.count > 1 ? ` (x${event.count})` : ''}`,
  }));

const snapshotItem = (
  snapshot: KubernetesWorkloadSnapshot,
): RawContextItem => ({
  id: `kubernetes:workload:${snapshot.cluster}/${snapshot.namespace}/${snapshot.name}`,
  source: 'kubernetes',
  kind: 'workload-snapshot',
  summary:
    `Workload ${snapshot.kind}/${snapshot.name} in ${snapshot.cluster}/${snapshot.namespace}: ` +
    `${snapshot.pods.length} pod(s), replicas ready=${snapshot.replicas?.ready ?? 'unknown'}` +
    `/desired=${snapshot.replicas?.desired ?? 'unknown'}; containers: ${snapshot.pods
      .flatMap(pod =>
        pod.containers.map(
          container =>
            `${container.name}(${container.state}${container.reason ? `, ${container.reason}` : ''}, restarts=${container.restartCount})`,
        ),
      )
      .join('; ')}`,
  reference: `${snapshot.cluster}/${snapshot.namespace}/${snapshot.kind}/${snapshot.name}`,
});

/**
 * Executes the context.gather node for the classified intent. Only the tools
 * listed in the intent plan are invoked, each wrapped in tool_call/tool_result
 * events; failed or skipped tools surface as report limitations through the
 * shared `InsightToolRunner`. Annotation gates turn missing integrations into
 * explicit limitations rather than wasted tool calls.
 */
export async function* gatherForIntent(
  input: GatherInput,
): AsyncGenerator<AgentEvent, void> {
  const { runId, state, intent, plan, references, raw, tools, now } = input;
  const entity = state.entity;
  if (!entity || plan.toolIds.length === 0) {
    return;
  }

  const invoke = async <TArgs, TResult>(toolId: string, args: TArgs) => {
    const call: AgentEvent = {
      type: 'tool_call',
      data: { runId, tool: toolId, args },
    };
    const result = await tools.invoke<TArgs, TResult>(toolId, args);
    const outcome: AgentEvent = {
      type: 'tool_result',
      data: {
        runId,
        tool: toolId,
        ok: result !== undefined,
        summary: result?.summary ?? 'tool unavailable',
      },
    };
    return { events: [call, outcome], result };
  };

  if (intent === 'ownership-oncall') {
    if (references && references.oncall.length === 0) {
      state.limitations.push(
        `Entity '${entity.ref}' has no on-call integration annotation (e.g. pagerduty.com/service-id); on-call data may be incomplete.`,
      );
    }
    const oncall = yield* wrap(
      invoke<OnCallShiftQuery, OnCallShift[]>('incident.oncall.get', {
        service: entity.name,
        team: entity.owner,
      }),
    );
    if (oncall) {
      raw.push(...oncallItems(entity.ref, oncall));
    }
    const incidents = yield* wrap(
      invoke<IncidentQuery, IncidentSummary[]>('incident.incident.list', {
        service: entity.name,
      }),
    );
    if (incidents) {
      raw.push(...incidentItems(entity.ref, incidents));
    }
    return;
  }

  if (intent === 'observability-links') {
    const dashboards = yield* wrap(
      invoke<DashboardQueryLike, DashboardLink[]>(
        'observability.dashboard.list',
        { service: entity.name, team: entity.owner },
      ),
    );
    if (dashboards) {
      raw.push(...dashboardItems(entity.ref, dashboards));
    }
    const logs = yield* wrap(
      invoke<LogQueryLike, unknown>('observability.logs.search', {
        service: entity.name,
        severity: 'error',
        limit: input.maxLogResults,
      }),
    );
    if (logs) {
      raw.push(...logItems(entity.ref, logs, input.maxLogResults));
    }
    return;
  }

  if (intent === 'deployment-health') {
    if (references && references.kubernetesIds.length === 0) {
      state.limitations.push(
        `Entity '${entity.ref}' has no 'backstage.io/kubernetes-id' annotation; deployment state may be incomplete.`,
      );
    }
    const resolved = yield* wrap(
      invoke<{ entityRef: string }, KubernetesWorkloadRef | undefined>(
        'kubernetes.workload.resolve',
        { entityRef: entity.ref },
      ),
    );
    if (resolved) {
      const snapshot = yield* wrap(
        invoke<KubernetesWorkloadRef, KubernetesWorkloadSnapshot>(
          'kubernetes.workload.get_snapshot',
          resolved,
        ),
      );
      if (snapshot) {
        raw.push(snapshotItem(snapshot));
      }

      const eventsArgs = {
        cluster: resolved.cluster,
        namespace: resolved.namespace,
        workload: resolved.name,
        limit: 50,
      };
      const events = yield* wrap(
        invoke<typeof eventsArgs, { events: KubernetesEventSummary[] }>(
          'kubernetes.workload.list_events',
          eventsArgs,
        ),
      );
      if (events) {
        raw.push(...eventItems(events.events));
      }

      const until = now().toISOString();
      const since = new Date(
        now().getTime() - input.lookbackMinutes * 60_000,
      ).toISOString();
      const timelineArgs = {
        cluster: resolved.cluster,
        namespace: resolved.namespace,
        workload: resolved.name,
        entityRef: entity.ref,
        since,
        until,
        limit: 50,
      };
      const timeline = yield* wrap(
        invoke<typeof timelineArgs, KubernetesWorkloadTimeline>(
          'kubernetes.workload.get_timeline',
          timelineArgs,
        ),
      );
      if (timeline) {
        raw.push(...eventItems(timeline.events));
      }
    }

    const repo = references?.repositories[0];
    if (repo) {
      const prs = yield* wrap(
        invoke<{ repoUrl: string }, PullRequestSummary[]>(
          'vcs.pull_request.list',
          { repoUrl: repo },
        ),
      );
      if (prs) {
        raw.push(...pullRequestItems(entity.ref, prs));
      }
    } else if (references) {
      state.limitations.push(
        `Entity '${entity.ref}' has no source repository annotation; recent change context is unavailable.`,
      );
    }
    return;
  }

  // general-context: catalog + retrieval only; nothing to gather.
}

/** Local arg aliases matching the registered tool payloads. */
type OnCallShiftQuery = { service?: string; team?: string };
type IncidentQuery = { service?: string; team?: string };
type DashboardQueryLike = { service?: string; team?: string };
type LogQueryLike = { service?: string; severity?: string; limit?: number };

/**
 * Sequencing helper: yields the tool_call/tool_result events produced by an
 * in-flight invocation and resolves to the tool output.
 */
async function* wrap<TResult>(
  pending: Promise<{ events: AgentEvent[]; result: { output: TResult } | undefined }>,
): AsyncGenerator<AgentEvent, TResult | undefined> {
  const { events, result } = await pending;
  for (const event of events) {
    yield event;
  }
  return result?.output;
}

