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
} from '@ai-crew-suite/plugin-kernel-node';
import { describe, expect, it, vi } from 'vitest';
import { AlertTunerGraph } from '../AlertTunerGraph';
import type { AlertAiTunerConfig } from '../../config';
import type { AlertTuningProposal } from '../state';

const NOW = new Date('2026-02-01T00:00:00.000Z');

const IAC_FILE = [
  'resource "prometheus_alert" "cpu_high" {',
  '  name      = "CPU Utilization High"',
  '  threshold = 85',
  '  for       = "2m"',
  '}',
].join('\n');

const NOISY_REQUEST = {
  version: 1,
  source: 'manual',
  alertId: 'cpu_high',
  service: 'checkout',
  repoUrl: 'https://github.com',
  iacPath: 'alerts.tf',
};

/** Resolved configuration mirroring every documented default. */
const CONFIG: AlertAiTunerConfig = {
  modelRef: 'alert-tuner',
  windowDays: 14,
  maxWindowDays: 30,
  maxHistoryEntries: 500,
  maxToolInvocations: 16,
  maxFileCharacters: 40_000,
  noise: {
    minSamples: 8,
    autoResolveRatio: 0.8,
    selfClearSeconds: 300,
    maxPagedRatio: 0.2,
    correlationWindowMinutes: 15,
  },
  patch: {
    maxThresholdIncreasePct: 15,
    maxDurationMultiplier: 3,
    peakHeadroomPct: 10,
    iacPaths: ['alerts.tf'],
  },
  sweep: { enabled: false, cron: '0 6 * * 1', maxSweepAlerts: 25, cooldownDays: 30, services: [] },
  publish: { enabled: false, branchPrefix: 'alert-tuner' },
};

/** Fifteen auto-resolved 90-second firings that never paged a responder. */
const alertHistory = () =>
  Array.from({ length: 15 }, (_unused, index) => {
    const triggeredAt = new Date(NOW.getTime() - (index + 1) * 3_600_000).toISOString();
    return {
      id: `alert-${index}`,
      alertId: 'cpu_high',
      title: 'CPU Utilization exceeds 85%',
      service: 'checkout',
      triggeredAt,
      resolvedAt: new Date(Date.parse(triggeredAt) + 90_000).toISOString(),
      resolution: 'auto',
      paged: false,
    };
  });

/**
 * Builds a workflow context whose `invokeTool` is a dynamic router keyed by tool
 * ID, so each scenario can grant or withhold individual capabilities. Unrouted
 * tools throw, which is exactly how an unregistered driver behaves at runtime.
 */
const createContext = (routes: Record<string, unknown>) => {
  const invokeTool = vi.fn(async ({ toolId }: { toolId: string }) => {
    if (!(toolId in routes)) {
      throw new Error(`tool '${toolId}' is not registered`);
    }
    return { toolId, output: routes[toolId], summary: `${toolId} ok` };
  });

  return {
    context: {
      logger: { warn: vi.fn(), info: vi.fn() },
      invokeTool,
    } as unknown as WorkflowContext,
    invokeTool,
  };
};

const runInput = (query: unknown): AgentRunInput =>
  ({
    runId: 'run-1',
    agentId: 'alert-ai-tuner',
    input: { query: JSON.stringify(query), source: 'catalog' },
  }) as AgentRunInput;

const collect = async (events: AsyncIterable<AgentEvent>) => {
  const collected: AgentEvent[] = [];
  for await (const event of events) collected.push(event);
  return collected;
};

const proposalFrom = (events: AgentEvent[]): AlertTuningProposal => {
  const artifact = events.find((event) => event.type === 'artifact');
  if (artifact?.type !== 'artifact' || !artifact.data.ref) {
    throw new Error('expected a proposal artifact');
  }
  return JSON.parse(artifact.data.ref) as AlertTuningProposal;
};

const graph = () => new AlertTunerGraph({ ...CONFIG, now: () => NOW });

describe('AlertTunerGraph', () => {
  /**
   * The plan's headline scenario: fifteen self-clearing firings plus the owning
   * HCL block must yield an anchored, capped diff and invoke no write tool.
   */
  it('proposes a capped anchored patch for a noisy alert without any write', async () => {
    const { context, invokeTool } = createContext({
      'incident.alert.history': alertHistory(),
      'incident.incident.list': [],
      'vcs.repository.get_metadata': { defaultBranch: 'main' },
      'vcs.repository.read_file': { content: IAC_FILE },
    });

    const proposal = proposalFrom(await collect(graph().run(runInput(NOISY_REQUEST), context)));

    expect(proposal.score).toMatchObject({ verdict: 'noisy', medianSelfClearSeconds: 90 });
    expect(proposal.patch?.diff).toContain('+  threshold = 97');
    expect(proposal.changes.map((change) => change.field)).toContain('threshold');

    const invoked = invokeTool.mock.calls.map(([call]) => call.toolId);
    expect(invoked).not.toContain('vcs.pull_request.create');
    expect(invoked).not.toContain('incident.incident.annotate');
  });

  /**
   * Missing metrics and the ungated deploy timeline must degrade the outcome to
   * `partial` with low confidence rather than presenting it as corroborated.
   */
  it('degrades to a partial proposal when optional evidence is unavailable', async () => {
    const { context } = createContext({
      'incident.alert.history': alertHistory(),
      'incident.incident.list': [],
      'vcs.repository.read_file': { content: IAC_FILE },
    });

    const proposal = proposalFrom(await collect(graph().run(runInput(NOISY_REQUEST), context)));

    expect(proposal.status).toBe('partial');
    expect(proposal.confidence).toBe('low');
    expect(proposal.limitations.join(' ')).toContain('Deploy and scaling correlation');
    expect(proposal.patch).toBeDefined();
  });

  /** A genuine incident overlap must remove the patch path completely. */
  it('refuses to patch when a real incident overlaps the firings', async () => {
    const { context } = createContext({
      'incident.alert.history': alertHistory(),
      'incident.incident.list': [
        {
          id: 'INC-1',
          title: 'Checkout latency breach',
          triggeredAt: new Date(NOW.getTime() - 3_600_000).toISOString(),
          resolvedAt: NOW.toISOString(),
        },
      ],
      'vcs.repository.read_file': { content: IAC_FILE },
    });

    const proposal = proposalFrom(await collect(graph().run(runInput(NOISY_REQUEST), context)));

    expect(proposal.status).toBe('not_noisy');
    expect(proposal.score?.verdict).toBe('real_signal');
    expect(proposal.score?.suppressedBy).toEqual(['inc-1']);
    expect(proposal.patch).toBeUndefined();
    expect(proposal.changes).toHaveLength(0);
  });

  /** Too little history must terminate before any repository read. */
  it('terminates as insufficient evidence below the sample floor', async () => {
    const { context, invokeTool } = createContext({
      'incident.alert.history': alertHistory().slice(0, 3),
    });

    const proposal = proposalFrom(await collect(graph().run(runInput(NOISY_REQUEST), context)));

    expect(proposal.status).toBe('insufficient_evidence');
    expect(proposal.confidence).toBe('low');
    expect(invokeTool.mock.calls.map(([call]) => call.toolId)).toEqual(['incident.alert.history']);
  });

  /** An unmatched alert name must be an explained outcome, not a guessed patch. */
  it('reports anchor_not_found when the alert block cannot be located', async () => {
    const { context } = createContext({
      'incident.alert.history': alertHistory(),
      'incident.incident.list': [],
      'vcs.repository.read_file': { content: 'resource "prometheus_alert" "other" {}' },
    });

    const proposal = proposalFrom(await collect(graph().run(runInput(NOISY_REQUEST), context)));

    expect(proposal.status).toBe('anchor_not_found');
    expect(proposal.patch).toBeUndefined();
    expect(proposal.limitations.join(' ')).toContain('No alert definition matching');
  });

  /** A payload scoping neither an alert nor a service must fail fast. */
  it('rejects a request that scopes neither an alert nor a service', async () => {
    const { context } = createContext({});
    const events = await collect(
      graph().run(runInput({ version: 1, source: 'manual' }), context)
    );

    expect(events.find((event) => event.type === 'error')).toBeDefined();
    expect(events.find((event) => event.type === 'artifact')).toBeUndefined();
  });
});
