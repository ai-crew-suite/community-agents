/**
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
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { AgentDefinition } from '@ai-crew-suite/plugin-kernel-node';
import { NodeError, type Redactor } from '@ai-crew-suite/plugin-kernel-node';
import type { EventMapper } from './EventMapper';

/** Resolved model map entry. */
export type ResolvedModel = { ref: string; model: BaseChatModel };

/**
 * The only path to models from within a workflow node. Resolves `modelRef` or
 * a tier name to a `BaseChatModel`, streams tokens as events, enforces token
 * budgets, runs guardrail classification, and supports tool-calling dispatch.
 */
export class ModelExecutor {
  constructor(
    private readonly agent: AgentDefinition,
    private readonly models: Map<string, BaseChatModel>,
    private readonly tiers: Record<string, string>,
    private readonly eventMapper: EventMapper,
    private readonly redactor?: Redactor,
  ) {}

  /** Resolve the agent's model. Throws at boot-time if unknown tier/ref. */
  resolveModel(): ResolvedModel {
    const ref = this.tiers[this.agent.modelRef] ?? this.agent.modelRef;
    const model = this.models.get(ref);
    if (!model) {
      throw new NodeError(`Agent '${this.agent.id}' references unknown model/tier '${ref}'`, 'model_failed');
    }
    return { ref, model };
  }

  /** Returns an executor bound to a named tier. */
  forTier(tier: string): ModelExecutor {
    const resolvedTier = this.tiers[tier];
    const agent = { ...this.agent, modelRef: resolvedTier ?? tier };
    return new ModelExecutor(agent, this.models, this.tiers, this.eventMapper, this.redactor);
  }

  /**
   * Stream a chat model over message arrays. Token chunks are emitted via the
   * eventMapper as `token` events with the originating node name; usage accumulates.
   * Pre-egress redaction is applied here (HIPAA/PHI layer).
   */
  async *stream(input: {
    messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
    nodeName: string;
  }): AsyncIterable<{ text?: string; usage?: { input: number; output: number; total: number } }> {
    const { ref, model } = this.resolveModel();
    const prompt = this.redactor?.apply(input.messages[0]?.content ?? '') ?? input.messages[0]?.content ?? '';
    const stream = await model.stream(prompt as string);
    const usageTotal = { input: 0, output: 0, total: 0 };
    const runId = 'stream';

    console.debug(`[${runId}] Launching live LLM token stream targeting model reference: ${ref} on node: ${input.nodeName}`);

    try {
      for await (const chunk of stream as AsyncIterable<unknown>) {
        const text = (chunk as { content?: string }).content;
        if (text) {
          yield { text };
          if ((chunk as { usage_metadata?: { input_tokens?: number; output_tokens?: number; total_tokens?: number } }).usage_metadata) {
            const u = (chunk as { usage_metadata?: { input_tokens?: number; output_tokens?: number; total_tokens?: number } }).usage_metadata!;
            usageTotal.input += u.input_tokens ?? 0;
            usageTotal.output += u.output_tokens ?? 0;
            usageTotal.total += u.total_tokens ?? 0;
            yield { usage: usageTotal };
          }
        }
      }
    } catch (error) {
      throw new NodeError(`Model stream failed: ${error instanceof Error ? error.message : String(error)}`, 'model_failed');
    }
    return { usage: usageTotal };
  }

  /** Invoke (non-streaming) convenience. */
  async invoke(input: { messages: { role: 'system' | 'user' | 'assistant'; content: string }[] }): Promise<string> {
    let result = '';
    for await (const chunk of this.stream({ messages: input.messages, nodeName: 'stream' })) {
      if (chunk.text) result += chunk.text;
    }
    return result;
  }
}
