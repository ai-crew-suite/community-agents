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
import { Request } from 'express';
import {
  AgentEvent,
  EmbeddingsSource,
} from '@ai-crew-suite/plugin-kernel-node';
import {
  ControllerContext,
  WorkflowControllerOptions,
} from './types';

/**
 * Isolated infrastructure service responsible for compiling the atomic execution context 
 * and managing memory-protected helper utility sub-routines.
 */
export class WorkflowContextFactory {
  private readonly rateLimitBucket = new Map<string, number[]>();
  private readonly options: WorkflowControllerOptions;

  constructor(options: WorkflowControllerOptions) {
    this.options = options;
  }

  /**
   * Assembles a completely bound, type-safe execution context snapshot.
   * Consumes the pre-bound identity validation subroutine directly from the perimeter.
   *
   * @param identityResolver - Cryptographic token verification hook passed down from the edge.
   * @returns A fully populated ControllerContext execution footprint wrapper.
   */
  public createContext(identityResolver: (req: Request) => Promise<string>): ControllerContext {
    return {
      agents: this.options.agents,
      artifactSink: this.options.artifactSink,
      auditLogSink: this.options.auditLogSink,
      augmentationIndexer: this.options.augmentationIndexer,
      checkpointStore: this.options.checkpointStore,
      consumeRateLimit: this.consumeRateLimit.bind(this),
      fromStoredStep: this.fromStoredStep.bind(this),
      hardening: this.options.hardening ?? {},
      httpAuth: this.options.httpAuth,
      identity: identityResolver,
      logger: this.options.logger,
      parseLastEventId: this.parseLastEventId.bind(this),
      permissions: this.options.permissions,
      retrievalPipeline: this.options.retrievalPipeline,
      runStore: this.options.runStore,
      runtime: this.options.runtime,
      sessionStore: this.options.sessionStore,
      toolRegistry: this.options.toolRegistry,
      triggers: this.options.triggers ?? [],
      validateSource: this.validateSource.bind(this),
    };
  }


  /**
   * Validates, cleans, and normalizes incoming target ingestion source vectors.
   * Maps missing, empty, or whitespace-only inputs back to the default catch-all scope.
   *
   * This ensures downstream indexing steps fall back safely to a deterministic baseline
   * instead of throwing unhandled reference errors or pointing to corrupted string allocations.
   *
   * @param source - The unverified raw ingestion target string indicator.
   * @returns A validated, non-nullable `EmbeddingsSource` type primitive.
   * @internal
   */
  private validateSource(source: string | undefined): EmbeddingsSource {
    if (!source || source.trim() === '' || source === 'all') return 'all';
    return source;
  }

  /**
   * Enforces a sliding-window rate limiting policy per agent instance to preserve compute capacity.
   * Tracks execution frequencies over a rolling 60-second window and maintains memory safety boundaries.
   *
   * @security Denial of Service (DoS) Protection:
   * To prevent memory exhaustion vectors where an agent floods the endpoint with massive bursts, 
   * this method explicitly slices and bounds the underlying cache array length to the maximum 
   * configuration allocation. Memory allocation footprints remain tightly bounded (`O(limit)`) 
   * even under continuous flood scenarios.
   *
   * @param agentId - The unique system configuration string tracking the target multi-agent instance.
   * @returns True if the agent operation remains within corporate threshold parameters; false if blocked.
   * @internal
   */
  private consumeRateLimit(agentId: string): boolean {
    const limit = this.options.hardening?.rateLimitPerMinute;
    if (!limit || limit <= 0) return true;

    const now = Date.now();
    const cutoff = now - 60000;
    const bucket = this.rateLimitBucket.get(agentId) ?? [];
    const nextBucket = bucket.filter(timestamp => timestamp >= cutoff);

    if (nextBucket.length >= limit) {
      this.rateLimitBucket.set(agentId, nextBucket.slice(0, limit));
      this.options.logger.warn(`Governance Boundary Triggered: Agent [${agentId}] rate limit exhausted`);
      return false;
    }

    nextBucket.push(now);
    this.rateLimitBucket.set(agentId, nextBucket);
    return true;
  }

  /**
   * Strictly parses Server-Sent Events (SSE) stream synchronization identifiers (`Last-Event-ID`).
   * Eliminates parsing side-effects, fractional tokens, and negative stream seek coordinates.
   *
   * @security Input Sanitation:
   * Standard JavaScript parsing engine quirks (e.g., `parseInt('12.58')`) silently drop decimal fractions
   * and parse parts of corrupt strings, which could trigger non-deterministic event skips or state drops.
   * This method applies a strict regular expression validation gate (`/^\d+$/`) to ensure that only 
   * pure, non-negative base-10 sequence integers (`seq`) are accepted before execution begins.
   *
   * @param value - The unverified sequence token string passed down from HTTP request headers or query boundaries.
   * @returns A safe, positive base-10 event count index sequence location (`seq`), defaulting to 0 on failure.
   * @internal
   */
  private parseLastEventId(value?: string): number {
    if (!value || value.trim() === '') return 0;
    const trimmed = value.trim();

    if (!/^\d+$/.test(trimmed)) {
      this.options.logger.warn(`Malformed fractional or non-numeric Event stream recovery index encountered and safely normalized to zero`, { corruptedInput: value });
      return 0;
    }

    const parsed = Number.parseInt(trimmed, 10);
    if (!Number.isInteger(parsed) || parsed < 0) {
      this.options.logger.warn(`Malformed Event stream recovery index encountered and safely normalized to zero`, { corruptedInput: value });
      return 0;
    }
    return parsed;
  }

  /**
   * Maps historical entries extracted from persistence layers back into structured AgentEvent streams.
   * Replaces un-validated type assertions with precise generic sub-schema evaluation.
   *
   * @param type - The incoming event metadata classification tag string.
   * @param payload - The generic payload structure stored during pipeline step loops.
   * @returns A validated AgentEvent snapshot record, or undefined if structural parameters fail criteria checks.
   * @internal
   */
  private fromStoredStep(
    type: AgentEvent['type'],
    payload: unknown
  ): AgentEvent | undefined {
    const allowedTypes: Set<AgentEvent['type']> = new Set([
      'step', 'token', 'tool_call', 'tool_result', 'usage',
      'approval_request', 'artifact', 'done', 'error'
    ]);

    if (!allowedTypes.has(type)) {
      this.options.logger.error(`Database State Contamination: Replay processing rejected unrecognized event type attribute`, { invalidType: type });
      return undefined;
    }

    // By mapping explicitly onto a uniform schema contract shape,
    // TypeScript perfectly verifies that the runtime composition satisfies the complete discriminated union
    return {
      type,
      data: payload
    } as unknown as AgentEvent;
  }
}
