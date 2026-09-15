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
import { LoggerService } from '@backstage/backend-plugin-api';

export interface RateLimiter {
  consume(agentId: string): boolean;
}

/**
 * Stateful, in-memory corporate governance rate limiter.
 * Aligns with Section B.1 Local Resiliency Throttling constraints without distributed state machines.
 */
export class AgentRateLimiter implements RateLimiter {
  private readonly rateLimitBucket = new Map<string, number[]>();

  public constructor(
    private readonly logger: LoggerService,
    private readonly limit: number
  ) {}

  public consume(agentId: string): boolean {
    if (this.limit <= 0) {
      return true;
    }

    const now = Date.now();
    const cutoff = now - 60000;
    const bucket = this.rateLimitBucket.get(agentId) ?? [];

    // Maintain strict immutable filtering patterns without array mutations
    const nextBucket = bucket.filter(timestamp => timestamp >= cutoff);

    if (nextBucket.length >= this.limit) {
      this.rateLimitBucket.set(agentId, nextBucket.slice(0, this.limit));
      this.logger.warn(`Governance Boundary Triggered: Agent [${agentId}] rate limit exhausted`, { agentId });
      return false;
    }

    nextBucket.push(now);
    this.rateLimitBucket.set(agentId, nextBucket);
    return true;
  }
}
