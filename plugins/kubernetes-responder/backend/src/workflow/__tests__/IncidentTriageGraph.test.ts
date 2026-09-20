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
import { describe, expect, it, vi } from 'vitest';
import type {
  AgentRunInput,
  AgentEvent,
  KubernetesWorkloadSnapshot,
  WorkflowContext,
} from '@ai-crew-suite/plugin-kernel-node';
import { IncidentTriageGraph } from '../IncidentTriageGraph';
import type { IncidentTriageReport } from '../state';

const collectEvents = async (events: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> => {
  const collected: AgentEvent[] = [];
  for await (const event of events) collected.push(event);
  return collected;
};

const FIXED_NOW = new Date('2026-08-20T12:00:00.000Z');

const graphOptions = {
  maxEvidenceItems: 20,
  maxLogBytes: 16_384,
  now: () => FIXED_NOW,
};

const input = (query: unknown): AgentRunInput => ({
  runId: 'run-1',
  agentId: 'kubernetes-ai-responder',
  input: {
    query: typeof query === 'string' ? query : JSON.stringify(query),
    source: 'catalog',
  },
});

const reportFrom = (events: AgentEvent[]): IncidentTriageReport => {
  const artifact = events.find(event => event.type === 'artifact');
  expect(artifact).toBeDefined();
  return JSON.parse(
    artifact!.type === 'artifact' ? artifact!.data.ref! : '{}',
  ) as IncidentTriageReport;
};

const scriptedModel = (responder: (prompt: string) => string | Error) =>
  ({
    invoke: vi.fn(async (prompt: string) => {
      const result = responder(prompt);
      if (result instanceof Error) {
        throw result;
      }
      return result;
    }),
  }) as unknown as WorkflowContext['model'];

/** Model that cites the first evidence ID advertised in the prompt. */
const validSynthesisModel = () =>
  scriptedModel(prompt => {
    const evidenceId = /\[(workload:[^\]]+)\]/.exec(prompt)?.[1];
    return JSON.stringify({
      likelyCauses: [
        {
          summary: 'Model-derived cause grounded in workload evidence.',
          confidence: 0.8,
          evidence: evidenceId ? [evidenceId] : [],
        },
      ],
      recommendedNextSteps: ['Inspect memory limits for the workload.'],
      limitations: [],
    });
  });

const createContext = (
  invokeTool: WorkflowContext['invokeTool'],
  model?: WorkflowContext['model'],
): WorkflowContext => ({
  agent: {
    id: 'kubernetes-ai-responder',
    modelRef: 'test-model',
    workflowRef: 'kubernetes-incident-triage',
    systemPrompt: 'test system prompt',
    toolIds: [
      'kubernetes.workload.resolve',
      'kubernetes.workload.get_snapshot',
      'kubernetes.pod.get_snapshot',
      'kubernetes.pod.get_logs',
      'kubernetes.workload.list_events',
      'kubernetes.workload.get_timeline',
    ],
  },
  invokeTool,
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: vi.fn() } as WorkflowContext['logger'],
  toolRegistry: {
    register: vi.fn(),
    get: vi.fn(),
    list: vi.fn(() => []),
  },
  model: model ?? (validSynthesisModel() as WorkflowContext['model']),
});

const workloadRef = {
  cluster: 'production',
  namespace: 'payments',
  name: 'payment-gateway',
  kind: 'Deployment' as const,
};

const oomSnapshot: KubernetesWorkloadSnapshot = {
  ...workloadRef,
  conditions: [],
  pods: [
    {
      cluster: 'production',
      namespace: 'payments',
      name: 'payment-gateway-1',
      phase: 'Failed',
      containers: [
        {
          name: 'app',
          ready: false,
          restartCount: 3,
          state: 'terminated',
          reason: 'OOMKilled',
        },
      ],
    },
  ],
};

const imagePullSnapshot: KubernetesWorkloadSnapshot = {
  ...workloadRef,
  conditions: [],
  pods: [
    {
      cluster: 'production',
      namespace: 'payments',
      name: 'payment-gateway-2',
      phase: 'Pending',
      containers: [
        {
          name: 'app',
          ready: false,
          restartCount: 0,
          state: 'waiting',
          reason: 'ImagePullBackOff',
        },
      ],
    },
  ],
};

/** Stateful fake driver dispatching per tool ID. */
const fakeTools = (handlers: Record<string, (args: any) => unknown>) => {
  const calls: { toolId: string; args: unknown }[] = [];
  const invokeTool = vi.fn(async ({ toolId, args }: { toolId: string; args: unknown }) => {
    calls.push({ toolId, args });
    const handler = handlers[toolId];
    if (!handler) {
      throw new Error(`unexpected tool ${toolId}`);
    }
    const output = handler(args);
    if (output instanceof Error) {
      throw output;
    }
    return { toolId, summary: `${toolId} summary`, output };
  }) as unknown as WorkflowContext['invokeTool'];
  return { invokeTool, calls };
};

const resolveHandler = () => [workloadRef];

describe('IncidentTriageGraph', () => {
  it('runs the OOM route: snapshot, previous logs, events, and a cited model report', async () => {
    const { invokeTool, calls } = fakeTools({
      'kubernetes.workload.resolve': resolveHandler,
      'kubernetes.workload.get_snapshot': () => oomSnapshot,
      'kubernetes.pod.get_logs': () => ({
        cluster: 'production',
        namespace: 'payments',
        pod: 'payment-gateway-1',
        container: 'app',
        previous: true,
        text: 'java.lang.OutOfMemoryError: Java heap space',
        truncated: false,
      }),
      'kubernetes.workload.list_events': () => [
        {
          cluster: 'production',
          namespace: 'payments',
          type: 'Warning',
          reason: 'OOMKilling',
          message: 'Memory cgroup out of memory: Killed process 1234',
          involvedObject: { kind: 'Pod', name: 'payment-gateway-1' },
          lastObservedAt: '2026-08-20T11:58:00.000Z',
        },
      ],
    });

    const events = await collectEvents(
      new IncidentTriageGraph(graphOptions).run(
        input({
          entityRef: 'component:default/payment-gateway',
          summary: 'pod failure',
          occurredAt: '2026-08-20T12:00:00.000Z',
        }),
        createContext(invokeTool),
      ),
    );

    expect(calls.map(call => call.toolId)).toEqual([
      'kubernetes.workload.resolve',
      'kubernetes.workload.get_snapshot',
      'kubernetes.pod.get_logs',
      'kubernetes.workload.list_events',
    ]);
    expect(events.map(event => event.type)).toEqual([
      'step', 'step', // trigger.validate
      'step', 'tool_call', 'tool_result', 'step', // workload.resolve
      'step', 'tool_call', 'tool_result', 'step', // workload.snapshot
      'step', 'step', // evidence.route
      'step', 'tool_call', 'tool_result', 'tool_call', 'tool_result', 'step', // evidence.collect
      'step', 'step', // evidence.normalize
      'step', 'step', // report.synthesize
      'step', 'artifact', 'step', 'done', // report.finalize
    ]);

    const report = reportFrom(events);
    expect(report.status).toBe('investigated');
    expect(report.failureClass).toBe('oom-killed');
    expect(report.likelyCauses[0].summary).toContain('Model-derived cause');
    const evidenceIds = new Set(report.timeline.map(item => item.id));
    for (const cause of report.likelyCauses) {
      expect(cause.evidence.length).toBeGreaterThan(0);
      for (const ref of cause.evidence) {
        expect(evidenceIds.has(ref)).toBe(true);
      }
    }
    expect(report.timeline.some(item => item.summary.includes('OOMKilled'))).toBe(true);
    expect(report.recommendedNextSteps).toEqual([
      'Inspect memory limits for the workload.',
    ]);
  });

  it('reports insufficient evidence when no workload resolves', async () => {
    const { invokeTool, calls } = fakeTools({
      'kubernetes.workload.resolve': () => [],
    });

    const events = await collectEvents(
      new IncidentTriageGraph(graphOptions).run(
        input({ entityRef: 'component:default/missing', summary: 'missing' }),
        createContext(invokeTool),
      ),
    );

    expect(calls.map(call => call.toolId)).toEqual(['kubernetes.workload.resolve']);
    const report = reportFrom(events);
    expect(report.status).toBe('insufficient_evidence');
    expect(report.limitations.join(' ')).toContain('No Kubernetes workload');
    expect(events.at(-1)?.type).toBe('done');
  });

  it('routes ImagePullBackOff to events and timeline, never to log collection', async () => {
    const { invokeTool, calls } = fakeTools({
      'kubernetes.workload.resolve': resolveHandler,
      'kubernetes.workload.get_snapshot': () => imagePullSnapshot,
      'kubernetes.workload.list_events': () => [
        {
          cluster: 'production',
          namespace: 'payments',
          type: 'Warning',
          reason: 'Failed',
          message: 'Failed to pull image "registry.local/app:v2": rpc error',
          involvedObject: { kind: 'Pod', name: 'payment-gateway-2' },
          lastObservedAt: '2026-08-20T11:59:00.000Z',
        },
      ],
      'kubernetes.workload.get_timeline': () => ({
        workload: workloadRef,
        events: [],
        snapshots: [imagePullSnapshot],
      }),
    });

    const events = await collectEvents(
      new IncidentTriageGraph(graphOptions).run(
        input({ entityRef: 'component:default/payment-gateway', summary: 'deploy stuck' }),
        createContext(invokeTool),
      ),
    );

    const toolIds = calls.map(call => call.toolId);
    expect(toolIds).toContain('kubernetes.workload.list_events');
    expect(toolIds).toContain('kubernetes.workload.get_timeline');
    expect(toolIds).not.toContain('kubernetes.pod.get_logs');

    const report = reportFrom(events);
    expect(report.failureClass).toBe('image-pull');
    expect(report.status).toBe('investigated');
  });

  it('degrades gracefully when a diagnostic tool fails', async () => {
    const { invokeTool } = fakeTools({
      'kubernetes.workload.resolve': resolveHandler,
      'kubernetes.workload.get_snapshot': () => oomSnapshot,
      'kubernetes.pod.get_logs': () => new Error('boom: log backend timeout'),
      'kubernetes.workload.list_events': () => [],
    });

    const events = await collectEvents(
      new IncidentTriageGraph(graphOptions).run(
        input({ entityRef: 'component:default/payment-gateway', summary: 'oom' }),
        createContext(invokeTool),
      ),
    );

    const report = reportFrom(events);
    expect(report.status).toBe('investigated');
    expect(report.limitations.join(' ')).toContain('boom: log backend timeout');
    expect(events.at(-1)?.type).toBe('done');
  });

  it('falls back to deterministic causes when the model emits invalid output', async () => {
    const { invokeTool } = fakeTools({
      'kubernetes.workload.resolve': resolveHandler,
      'kubernetes.workload.get_snapshot': () => oomSnapshot,
      'kubernetes.pod.get_logs': () => {
        throw new Error('no logs');
      },
      'kubernetes.workload.list_events': () => [],
    });
    const model = scriptedModel(() => 'this is not json at all');

    const events = await collectEvents(
      new IncidentTriageGraph(graphOptions).run(
        input({ entityRef: 'component:default/payment-gateway', summary: 'oom' }),
        createContext(invokeTool, model as WorkflowContext['model']),
      ),
    );

    const report = reportFrom(events);
    expect(report.likelyCauses[0].summary).toContain('OOMKilled');
    expect(report.limitations.join(' ')).toContain('report schema');
  });


  it('drops uncited model causes instead of fabricating citations', async () => {
    const { invokeTool } = fakeTools({
      'kubernetes.workload.resolve': resolveHandler,
      'kubernetes.workload.get_snapshot': () => oomSnapshot,
      'kubernetes.pod.get_logs': () => {
        throw new Error('no logs');
      },
      'kubernetes.workload.list_events': () => [],
    });
    const model = scriptedModel(() =>
      JSON.stringify({
        likelyCauses: [
          { summary: 'Invented cause with fake citation.', confidence: 0.9, evidence: ['log:nowhere'] },
        ],
        recommendedNextSteps: [],
        limitations: [],
      }),
    );

    const events = await collectEvents(
      new IncidentTriageGraph(graphOptions).run(
        input({ entityRef: 'component:default/payment-gateway', summary: 'oom' }),
        createContext(invokeTool, model as WorkflowContext['model']),
      ),
    );

    const report = reportFrom(events);
    expect(report.likelyCauses.some(c => c.summary.includes('Invented cause'))).toBe(false);
    expect(report.likelyCauses[0].summary).toContain('OOMKilled');
  });

  it('redacts credential-like strings from log evidence before persistence', async () => {
    const { invokeTool } = fakeTools({
      'kubernetes.workload.resolve': resolveHandler,
      'kubernetes.workload.get_snapshot': () => oomSnapshot,
      'kubernetes.pod.get_logs': () => ({
        cluster: 'production',
        namespace: 'payments',
        pod: 'payment-gateway-1',
        container: 'app',
        previous: true,
        text: 'connect failed password=SuperSecret123 for db',
        truncated: false,
      }),
      'kubernetes.workload.list_events': () => [],
    });

    const events = await collectEvents(
      new IncidentTriageGraph(graphOptions).run(
        input({ entityRef: 'component:default/payment-gateway', summary: 'oom' }),
        createContext(invokeTool),
      ),
    );

    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain('SuperSecret123');
    expect(reportFrom(events).timeline.some(item => item.summary.includes('[REDACTED]'))).toBe(true);
  });

  it('emits an error event for an invalid trigger payload', async () => {
    const { invokeTool, calls } = fakeTools({});
    const events = await collectEvents(
      new IncidentTriageGraph(graphOptions).run(
        input('not a json trigger'),
        createContext(invokeTool),
      ),
    );

    expect(calls).toHaveLength(0);
    expect(events.at(-1)).toMatchObject({ type: 'error' });
  });

  it('resolves workloads directly from trigger coordinates without the resolve tool', async () => {
    const { invokeTool, calls } = fakeTools({
      'kubernetes.workload.get_snapshot': () => oomSnapshot,
      'kubernetes.pod.get_logs': () => {
        throw new Error('no logs');
      },
      'kubernetes.workload.list_events': () => [],
    });

    const events = await collectEvents(
      new IncidentTriageGraph(graphOptions).run(
        input({
          cluster: 'production',
          namespace: 'payments',
          workload: 'payment-gateway',
          summary: 'coordinate trigger',
        }),
        createContext(invokeTool),
      ),
    );

    expect(calls.map(call => call.toolId)).not.toContain('kubernetes.workload.resolve');
    expect(reportFrom(events).status).toBe('investigated');
  });
});

