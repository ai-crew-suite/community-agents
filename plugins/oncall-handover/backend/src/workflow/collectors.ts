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
import type { AgentEvent } from '@ai-crew-suite/plugin-kernel-node';
import type { HandoverToolRunner } from '../services/HandoverToolRunner';
import type { RawSignal } from './state';

type UnknownRecord = Record<string, unknown>;

const record = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const entries = (value: unknown): unknown[] => {
  if (Array.isArray(value)) return value;
  if (!record(value)) return [];
  return Object.values(value).flatMap((item) => (Array.isArray(item) ? item : []));
};

const text = (value: unknown, ...keys: string[]) => {
  if (!record(value)) return undefined;
  for (const key of keys) {
    if (typeof value[key] === 'string' && value[key]) return value[key] as string;
  }
  return undefined;
};

const signalStatus = (value: unknown): RawSignal['status'] => {
  const status = text(value, 'status', 'state') ?? '';
  if (/active|triggered|open/i.test(status)) return 'active';
  if (/resolved|closed/i.test(status)) return 'resolved';
  return 'unknown';
};

const normalize = (
  source: RawSignal['source'],
  kind: string,
  output: unknown,
  max: number
): RawSignal[] =>
  entries(output)
    .slice(0, max)
    .map((item, index) => ({
      id: `${source}:${kind}:${index}`,
      source,
      kind,
      summary: text(item, 'title', 'summary', 'message', 'name', 'key') ?? `${kind} observation`,
      service: text(item, 'service', 'team', 'entityRef'),
      observedAt: text(item, 'observedAt', 'triggeredAt', 'updatedAt', 'createdAt', 'mergedAt'),
      reference: text(item, 'url', 'htmlUrl', 'key', 'id'),
      status: signalStatus(item),
    }));

/** Runs bounded independent collectors concurrently and emits tool progress events. */
export async function* collectSignals(input: {
  runId: string;
  team?: string;
  entityRefs?: string[];
  window: { start: string; end: string };
  tools: HandoverToolRunner;
  maxSignalsPerSource: number;
}): AsyncGenerator<AgentEvent, RawSignal[]> {
  const queries: [string, RawSignal['source'], string, unknown][] = [
    [
      'incident.alert.history',
      'incident',
      'alert',
      { team: input.team, since: input.window.start, until: input.window.end, limit: input.maxSignalsPerSource },
    ],
    [
      'incident.incident.list',
      'incident',
      'incident',
      { team: input.team, since: input.window.start, until: input.window.end, limit: input.maxSignalsPerSource },
    ],
    [
      'kubernetes.workload.get_timeline',
      'kubernetes',
      'deployment',
      { entityRefs: input.entityRefs, since: input.window.start, until: input.window.end, limit: input.maxSignalsPerSource },
    ],
    [
      'vcs.pull_request.list',
      'vcs',
      'pr',
      { entityRefs: input.entityRefs, since: input.window.start, until: input.window.end, merged: true, limit: input.maxSignalsPerSource },
    ],
    [
      'project.ticket.search',
      'project',
      'ticket',
      { team: input.team, status: 'open', priority: 'high', limit: input.maxSignalsPerSource },
    ],
  ];

  for (const [tool] of queries) {
    yield {
      type: 'tool_call',
      data: { runId: input.runId, tool, args: { window: input.window, team: input.team } },
    };
  }

  const results = await Promise.all(
    queries.map(async ([tool, source, kind, args]) => ({
      tool,
      source,
      kind,
      result: await input.tools.invoke(tool, args),
    }))
  );

  const signals: RawSignal[] = [];

  for (const result of results) {
    yield {
      type: 'tool_result',
      data: {
        runId: input.runId,
        tool: result.tool,
        ok: !!result.result,
        summary: result.result?.summary,
      },
    };

    if (result.result) {
      signals.push(
        ...normalize(result.source, result.kind, result.result.output, input.maxSignalsPerSource)
      );
    }
  }

  return signals;
}
