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
  CatalogEntitySummary,
  CatalogIntegrationReferences,
  WorkflowContext,
} from '@ai-crew-suite/plugin-kernel-node';
import { describe, expect, it, vi } from 'vitest';
import { CatalogInsightsGraph } from '../CatalogInsightsGraph';
import type { CatalogInsightReport } from '../state';

const entity: CatalogEntitySummary = {
  ref: 'component:default/payment-gateway',
  kind: 'Component',
  namespace: 'default',
  name: 'payment-gateway',
  type: 'service',
  lifecycle: 'production',
  owner: 'team-alpha',
  annotations: {
    'backstage.io/kubernetes-id': 'payment-gateway',
    'pagerduty.com/service-id': 'PABC123',
  },
  tags: [],
};

const references: CatalogIntegrationReferences = {
  kubernetesIds: ['payment-gateway'],
  repositories: ['acme/payment-gateway'],
  oncall: ['PABC123'],
  monitoring: [],
};

const failingWorkload = {
  cluster: 'prod',
  namespace: 'payments',
  name: 'payment-gateway',
  kind: 'Deployment' as const,
  entityRef: entity.ref,
};

const failingSnapshot = {
  ...failingWorkload,
  replicas: { desired: 2, ready: 0 },
  conditions: [],
  pods: [
    {
      cluster: 'prod',
      namespace: 'payments',
      name: 'payment-gateway-xyz',
      containers: [
        {
          name: 'app',
          ready: false,
          restartCount: 12,
          state: 'waiting' as const,
          reason: 'CrashLoopBackOff',
        },
      ],
    },
  ],
};

type ToolRouter = Record<string, unknown>;

const createContext = (
  tools: ToolRouter,
  modelOutput?: string,
): WorkflowContext => {
  const invokeTool = vi.fn(
    async ({ toolId, args }: { toolId: string; args: unknown }) => {
      const handler = tools[toolId];
      if (handler === undefined) {
        throw new Error(`Tool '${toolId}' is not registered`);
      }
      const output =
        typeof handler === 'function'
          ? (handler as (callArgs: unknown) => unknown)(args)
          : handler;
      if (output instanceof Error) {
        throw output;
      }
      return {
        toolId,
        output: (await output) as never,
        summary: `${toolId} ok`,
      };
    },
  );
  return {
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      child: vi.fn(),
    } as never,
    agent: {
      id: 'catalog-ai-insights',
      modelRef: 'catalog-insights',
      workflowRef: 'catalog-insights',
      systemPrompt: 'test prompt',
      toolIds: Object.keys(tools),
    },
    invokeTool: invokeTool as never,
    model: {
      invoke: vi.fn(async () =>
        modelOutput ?? JSON.stringify({ answer: [], links: [], limitations: [] }),
      ),
    } as never,
    toolRegistry: { get: vi.fn(), list: vi.fn(() => []) } as never,
  };
};

const createResolver = (
  found: CatalogEntitySummary | undefined,
): CatalogEntityResolver => ({
  getEntitySummary: vi.fn(async () => found),
  findByAnnotation: vi.fn(async () => []),
  getRelations: vi.fn(async () => ({
    rootRef: entity.ref,
    entities: {},
    relations: [],
    truncated: false,
  })),
  getIntegrationReferences: vi.fn(async () => references),
});

const createInput = (
  question: string,
  entityRef = entity.ref,
): AgentRunInput => ({
  runId: 'run-1',
  agentId: 'catalog-ai-insights',
  input: {
    query: JSON.stringify({ version: 1, entityRef, question, source: 'manual' }),
    source: 'catalog',
  },
});

const collect = async (
  events: AsyncIterable<AgentEvent>,
): Promise<AgentEvent[]> => {
  const collected: AgentEvent[] = [];
  for await (const event of events) {
    collected.push(event);
  }
  return collected;
};

const reportFrom = (events: AgentEvent[]): CatalogInsightReport => {
  const artifact = events.find(
    event =>
      event.type === 'artifact' && event.data.kind === 'catalog-insight-report',
  );
  expect(artifact).toBeDefined();
  return JSON.parse(
    (artifact as { data: { ref: string } }).data.ref,
  ) as CatalogInsightReport;
};

const crashLoopModelOutput = JSON.stringify({
  answer: [
    {
      text: 'The deployment is failing because the app container is in CrashLoopBackOff with 12 restarts.',
      citations: ['ctx-2'],
    },
  ],
  links: [],
  limitations: [],
});

const deploymentTools: ToolRouter = {
  'knowledge.retrieve': [],
  'kubernetes.workload.resolve': failingWorkload,
  'kubernetes.workload.get_snapshot': failingSnapshot,
  'kubernetes.workload.list_events': {
    events: [
      {
        cluster: 'prod',
        namespace: 'payments',
        type: 'Warning',
        reason: 'FailedSync',
        message: 'Back-off restarting failed container',
      },
    ],
  },
  'kubernetes.workload.get_timeline': { events: [], snapshots: [] },
  'vcs.pull_request.list': [
    {
      number: 102,
      title: 'fix: tighten readiness probe',
      state: 'merged',
      author: 'alice',
      url: 'https://github.com/acme/payment-gateway/pull/102',
    },
  ],
};

describe('CatalogInsightsGraph', () => {
  it('explains a failing deployment with cited, normalized context', async () => {
    const context = createContext(deploymentTools, crashLoopModelOutput);
    const graph = new CatalogInsightsGraph({ resolver: createResolver(entity) });

    const events = await collect(
      graph.run(
        createInput('Why did this service fail its last deployment?'),
        context,
      ),
    );

    const nodes = events
      .filter(e => e.type === 'step' && e.data.phase === 'enter')
      .map(e => (e as { data: { node: string } }).data.node);
    expect(nodes).toEqual([
      'request.validate',
      'intent.classify',
      'context.gather',
      'context.retrieve',
      'context.normalize',
      'insight.synthesize',
      'insight.finalize',
    ]);

    const report = reportFrom(events);
    expect(report.status).toBe('answered');
    expect(report.intent).toBe('deployment-health');
    expect(report.answer[0].text).toContain('CrashLoopBackOff');
    // Every citation must resolve to a retained context item.
    const ids = new Set(report.context.map(c => c.id));
    for (const block of report.answer) {
      expect(block.citations.length).toBeGreaterThan(0);
      for (const citation of block.citations) {
        expect(ids.has(citation)).toBe(true);
      }
    }
    expect(events.at(-1)).toEqual({
      type: 'done',
      data: { runId: 'run-1', sessionId: undefined },
    });
  });

  it('answers an on-call question through the incident tools', async () => {
    const context = createContext(
      {
        'knowledge.retrieve': [],
        'incident.oncall.get': [
          { responder: { name: 'alice' }, policyName: 'payments-primary' },
        ],
        'incident.incident.list': [],
      },
      JSON.stringify({
        answer: [
          { text: 'alice is on-call via payments-primary.', citations: ['ctx-2'] },
        ],
        links: [],
        limitations: [],
      }),
    );
    const graph = new CatalogInsightsGraph({ resolver: createResolver(entity) });

    const events = await collect(
      graph.run(createInput('Who is the on-call for this service?'), context),
    );
    const report = reportFrom(events);

    expect(report.intent).toBe('ownership-oncall');
    expect(report.answer[0].text).toContain('alice');
    expect(context.invokeTool).toHaveBeenCalledWith(
      expect.objectContaining({ toolId: 'incident.oncall.get' }),
    );
  });

  it('surfaces dashboards for observability questions and never calls incident tools', async () => {
    const context = createContext({
      'knowledge.retrieve': [],
      'observability.dashboard.list': [
        { id: 'd1', title: 'Payments Overview', url: 'https://example.com/d1' },
      ],
      'observability.logs.search': [],
    });
    const graph = new CatalogInsightsGraph({ resolver: createResolver(entity) });

    const events = await collect(
      graph.run(createInput('Where are the logs and dashboards?'), context),
    );
    const report = reportFrom(events);

    expect(report.intent).toBe('observability-links');
    expect(
      report.context.some(
        item =>
          item.kind === 'dashboard-link' &&
          item.reference === 'https://example.com/d1',
      ),
    ).toBe(true);
    const invokedTools = (
      context.invokeTool as ReturnType<typeof vi.fn>
    ).mock.calls.map(call => call[0].toolId);
    expect(invokedTools).not.toContain('incident.oncall.get');
    expect(invokedTools).not.toContain('kubernetes.workload.resolve');
  });

  it('records a limitation instead of failing when the kubernetes tool is missing', async () => {
    const context = createContext({
      'knowledge.retrieve': [],
      // deployment-health tools intentionally absent
    });
    const graph = new CatalogInsightsGraph({ resolver: createResolver(entity) });

    const events = await collect(
      graph.run(createInput('Why did the last deployment fail?'), context),
    );
    const report = reportFrom(events);

    expect(report.status).toBe('partial');
    expect(
      report.limitations.some(l => l.includes('kubernetes.workload.resolve')),
    ).toBe(true);
    expect(events.at(-1)?.type).toBe('done');
  });

  it('degrades to a deterministic answer when the model output is invalid', async () => {
    const context = createContext(
      {
        'knowledge.retrieve': [],
        'incident.oncall.get': [
          { responder: { name: 'bob' }, policyName: 'payments-primary' },
        ],
        'incident.incident.list': [],
      },
      'this is not json',
    );
    const graph = new CatalogInsightsGraph({ resolver: createResolver(entity) });

    const events = await collect(
      graph.run(createInput('Who is on-call?'), context),
    );
    const report = reportFrom(events);

    expect(report.status).toBe('partial');
    expect(report.answer.some(block => block.text.includes('bob'))).toBe(true);
    expect(report.limitations.some(l => l.includes('report schema'))).toBe(true);
  });

  it('fails fast for unknown entities without calling any tool or the model', async () => {
    const context = createContext({});
    const graph = new CatalogInsightsGraph({ resolver: createResolver(undefined) });

    const events = await collect(
      graph.run(createInput('Who is on-call?', 'component:default/ghost'), context),
    );

    expect(events.at(-1)?.type).toBe('error');
    expect((events.at(-1) as { data: { message: string } }).data.message).toContain(
      'ghost',
    );
    expect(context.invokeTool).not.toHaveBeenCalled();
    expect(context.model.invoke).not.toHaveBeenCalled();
  });

  it('fails fast for malformed queries', async () => {
    const context = createContext({});
    const graph = new CatalogInsightsGraph({ resolver: createResolver(entity) });

    const events = await collect(
      graph.run(
        {
          runId: 'run-1',
          agentId: 'catalog-ai-insights',
          input: { query: 'plain text', source: 'catalog' },
        },
        context,
      ),
    );

    expect(events.at(-1)?.type).toBe('error');
    expect(context.model.invoke).not.toHaveBeenCalled();
  });

  it('honors the tool invocation budget', async () => {
    const context = createContext(deploymentTools);
    const graph = new CatalogInsightsGraph({
      resolver: createResolver(entity),
      maxToolInvocations: 2,
    });

    const events = await collect(
      graph.run(createInput('Why did the deployment fail?'), context),
    );
    const report = reportFrom(events);

    expect(report.limitations.some(l => l.includes('budget'))).toBe(true);
  });
});

