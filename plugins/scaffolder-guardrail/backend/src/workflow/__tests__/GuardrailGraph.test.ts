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
import type { AgentEvent, AgentRunInput, WorkflowContext } from '@ai-crew-suite/plugin-kernel-node';
import { describe, expect, it, vi } from 'vitest';
import { GuardrailGraph } from '../GuardrailGraph';

const config = {
  modelRef: 'guardrail',
  maxParameterBytes: 16384,
  maxToolInvocations: 12,
  maxNegotiationRounds: 3,
  policies: ['corp'],
  severity: { 'instance-type-not-approved': 'negotiable' as const },
  thresholdUsd: 1000,
  perEnvironment: {},
  instanceTypeLadder: ['db.m5.16xlarge', 'db.m5.large'],
  instanceTypeByEnvironment: {}
};

const input = (): AgentRunInput => ({
  runId: 'run-1',
  agentId: 'scaffolder-ai-guardrail-agent',
  input: {
    query: JSON.stringify({
      version: 1,
      source: 'manual',
      templateRef: 'template:default/db',
      requestedBy: 'user:default/alice',
      parameters: { instanceType: 'db.m5.16xlarge' }
    }),
    source: 'catalog'
  }
} as AgentRunInput);

const collect = async (events: AsyncIterable<AgentEvent>) => {
  const out: AgentEvent[] = [];
  for await (const event of events) out.push(event);
  return out;
};

describe('GuardrailGraph', () => {
  it('checkpoints a policy-derived downscale offer before negotiation approval', async () => {
    const checkpoint = { save: vi.fn(), load: vi.fn() };

    const invokeTool = vi.fn(async ({ toolId }: { toolId: string }) => {
      if (toolId === 'compliance.policy.evaluate') {
        return {
          toolId,
          summary: 'ok',
          output: {
            policyId: 'corp',
            passed: false,
            violations: [{ rule: 'instance-type-not-approved', message: 'too large' }]
          }
        };
      }
      if (toolId === 'compliance.architecture.validate') {
        return { toolId, summary: 'ok', output: { valid: true } };
      }
      return { toolId, summary: 'ok', output: { estimated: true, currency: 'USD', amount: 4500 } };
    });

    const context = { logger: { warn: vi.fn() }, invokeTool, checkpointStore: checkpoint } as unknown as WorkflowContext;
    const events = await collect(new GuardrailGraph(config).run(input(), context));

    const assessment = JSON.parse(
      (events.find(event => event.type === 'artifact') as Extract<AgentEvent, { type: 'artifact' }>).data.ref!
    );

    expect(assessment).toMatchObject({
      status: 'negotiable',
      mutations: [{ from: 'db.m5.16xlarge', to: 'db.m5.large' }]
    });
    expect(events.some(event => event.type === 'approval_request')).toBe(true);
    expect(checkpoint.save).toHaveBeenCalledTimes(1);
    expect(invokeTool.mock.calls.map(([call]) => call.toolId)).not.toContain('scaffolder.execute');
  });

  it('refuses a missing compliance driver as undetermined rather than compliant', async () => {
    const context = {
      logger: { warn: vi.fn() },
      invokeTool: vi.fn(async () => { throw new Error('missing driver'); })
    } as unknown as WorkflowContext;

    const events = await collect(new GuardrailGraph(config).run(input(), context));

    const assessment = JSON.parse(
      (events.find(event => event.type === 'artifact') as Extract<AgentEvent, { type: 'artifact' }>).data.ref!
    );

    expect(assessment.status).toBe('undetermined');
  });
});
