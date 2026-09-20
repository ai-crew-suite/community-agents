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
  AlertHistoryEntry,
  IncidentDetail,
  WorkflowContext,
  WorkflowRunner,
} from '@ai-crew-suite/plugin-kernel-node';
import type { PostmortemConfig } from '../config';
import { postmortemDraftArtifact } from '../services/PostmortemArtifactWriter';
import { mergeTimeline } from './merge';
import type {
  PostmortemDraft,
  PostmortemRequest,
  TimelineEvent,
} from './state';

/** Stable workflow ID for cited incident postmortem timeline drafting. */
export const TECHDOCS_POSTMORTEM_WORKFLOW_ID = 'techdocs-postmortem';

/** Produces a deterministic incident/alert timeline draft without publication or causal claims. */
export class PostmortemGraph implements WorkflowRunner {
  readonly id = TECHDOCS_POSTMORTEM_WORKFLOW_ID;

  constructor(private readonly config: PostmortemConfig) {}

  async *run(
    input: AgentRunInput,
    context: WorkflowContext,
  ): AsyncIterable<AgentEvent> {
    let request: PostmortemRequest;

    try {
      const raw = JSON.parse(input.input.query) as Record<string, unknown>;

      if (
        raw.version !== 1 ||
        typeof raw.incidentId !== 'string' ||
        !raw.incidentId
      )
        throw new Error('Request requires version 1 and incidentId');

      request = { version: 1, source: 'manual', incidentId: raw.incidentId };
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

    const limitations = [
      'Chat transcript, observability metrics/logs, deployment/PR activity, causal analysis, and publication are not active in this read-only timeline draft.',
    ];

    yield step('incident.resolve', 'enter');

    let incident: IncidentDetail;

    try {
      incident = (
        await context.invokeTool<{ incidentId: string }, IncidentDetail>({
          toolId: 'incident.incident.get',
          args: { incidentId: request.incidentId },
          limits: { timeoutMs: 10_000 },
        })
      ).output;
    } catch {
      const draft: PostmortemDraft = {
        incidentId: request.incidentId,
        title: 'Incident unavailable',
        status: 'incident_unavailable',
        timeline: [],
        narrative:
          'No incident timeline can be drafted because incident detail was unavailable.',
        coverage: {
          incident: 'unavailable',
          alerts: 'unavailable',
          chat: 'unavailable',
          observability: 'unavailable',
          vcs: 'unavailable',
        },
        limitations,
      };

      yield postmortemDraftArtifact(input.runId, draft);
      yield { type: 'done', data: { runId: input.runId } };

      return;
    }
    yield step('incident.resolve', 'exit');

    if (!incident.resolvedAt) {
      yield postmortemDraftArtifact(input.runId, {
        incidentId: incident.id,
        title: incident.title,
        status: 'incident_open',
        timeline: [],
        narrative:
          'Timeline drafting is deferred until the incident is resolved.',
        coverage: {
          incident: 'collected',
          alerts: 'unavailable',
          chat: 'unavailable',
          observability: 'unavailable',
          vcs: 'unavailable',
        },
        limitations,
      });

      yield { type: 'done', data: { runId: input.runId } };

      return;
    }

    const since = new Date(
      new Date(incident.triggeredAt ?? incident.resolvedAt).getTime() -
        this.config.paddingMinutes * 60_000,
    ).toISOString();

    const until = new Date(
      new Date(incident.resolvedAt).getTime() +
        this.config.paddingMinutes * 60_000,
    ).toISOString();

    const events: TimelineEvent[] = [];

    if (incident.triggeredAt)
      events.push({
        id: 'ev-1',
        source: 'incident',
        at: incident.triggeredAt,
        summary: `Incident triggered: ${incident.title}`,
        reference: incident.url,
      });

    if (incident.acknowledgedAt)
      events.push({
        id: 'ev-2',
        source: 'incident',
        at: incident.acknowledgedAt,
        summary: 'Incident acknowledged',
        reference: incident.url,
      });

    for (const note of incident.notes ?? [])
      if (note.createdAt)
        events.push({
          id: `ev-note-${events.length + 1}`,
          source: 'incident',
          at: note.createdAt,
          summary: 'Incident responder note recorded',
          reference: incident.url,
        });

    if (incident.resolvedAt)
      events.push({
        id: `ev-resolved`,
        source: 'incident',
        at: incident.resolvedAt,
        summary: 'Incident resolved',
        reference: incident.url,
      });

    yield step('alerts.collect', 'enter');

    let alerts: AlertHistoryEntry[] = [];
    let alertsAvailable = true;

    try {
      alerts = (
        await context.invokeTool<
          {
            service?: string;
            team?: string;
            since: string;
            until: string;
            limit: number;
          },
          AlertHistoryEntry[]
        >({
          toolId: 'incident.alert.history',
          args: {
            service: incident.service,
            team: incident.team,
            since,
            until,
            limit: 50,
          },
          limits: { timeoutMs: 10_000 },
        })
      ).output;
    } catch {
      alertsAvailable = false;
      limitations.push('Alert history was unavailable.');
    }

    yield step('alerts.collect', 'exit');

    alerts.forEach((alert, index) => {
      if (alert.triggeredAt)
        events.push({
          id: `ev-alert-${index + 1}`,
          source: 'alert',
          at: alert.triggeredAt,
          summary: `Alert fired: ${alert.title}`,
          reference: alert.id,
        });
    });

    const timeline = mergeTimeline(events);
    const status = alertsAvailable ? 'draft_only' : 'partial';

    const narrative = timeline.length
      ? timeline
          .map(event => `${event.at}: ${event.summary} [${event.id}]`)
          .join('\n')
      : 'No timestamped incident evidence was available.';

    yield postmortemDraftArtifact(input.runId, {
      incidentId: incident.id,
      title: incident.title,
      status,
      window: { since, until },
      timeline,
      narrative,
      coverage: {
        incident: 'collected',
        alerts: alertsAvailable ? 'collected' : 'unavailable',
        chat: 'unavailable',
        observability: 'unavailable',
        vcs: 'unavailable',
      },
      limitations,
    });

    yield { type: 'done', data: { runId: input.runId } };
  }
}
