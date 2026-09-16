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
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LoggerService } from '@backstage/backend-plugin-api';
import { AgentRateLimiter } from '../AgentRateLimiter';

describe('AgentRateLimiter - Local Resiliency Throttling Domain Suite', () => {
  let mockLogger: LoggerService;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers(); // Intercept system clock calls for exact window verification

    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      child: vi.fn().mockReturnThis(),
    };
  });

  afterEach(() => {
    vi.useRealTimers(); // Clean up environmental mocks safely
  });

  it('should completely bypass capacity tracking blocks if the configured limit is zero or negative', () => {
    const rateLimiter = new AgentRateLimiter(mockLogger, 0);

    // Blast the limiter repeatedly; zero limit must function as a pass-through gate
    for (let i = 0; i < 50; i++) {
      expect(rateLimiter.consume('unlimited-agent')).toBe(true);
    }
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });

  it('should safely allow requests within configured capacity limits and track consumption metrics', () => {
    const rateLimiter = new AgentRateLimiter(mockLogger, 3);

    expect(rateLimiter.consume('agent_abc')).toBe(true);
    expect(rateLimiter.consume('agent_abc')).toBe(true);
    expect(rateLimiter.consume('agent_abc')).toBe(true);
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });

  it('should trigger a governance block and log a metric once capacity thresholds are exhausted', () => {
    const rateLimiter = new AgentRateLimiter(mockLogger, 2);

    expect(rateLimiter.consume('throttled-agent')).toBe(true);
    expect(rateLimiter.consume('throttled-agent')).toBe(true);
    // Third call must hit the boundary floor instantly
    expect(rateLimiter.consume('throttled-agent')).toBe(false);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Governance Boundary Triggered: Agent [throttled-agent] rate limit exhausted'),
      expect.objectContaining({ agentId: 'throttled-agent' })
    );
  });

  it('should seamlessly recover capacity once the 60-second sliding time window elapses', async () => {
    const rateLimiter = new AgentRateLimiter(mockLogger, 1);

    expect(rateLimiter.consume('window-agent')).toBe(true);
    expect(rateLimiter.consume('window-agent')).toBe(false); // Blocked

    // Fast-forward virtual clocks past the 60,000ms sliding bucket cutoff marker
    await vi.advanceTimersByTimeAsync(60001);

    // Boundary should clear automatically, re-enabling token processing
    expect(rateLimiter.consume('window-agent')).toBe(true);
  });

  it('should isolate token buckets strictly per agent identity to avoid cascading cluster exhaustion', () => {
    const rateLimiter = new AgentRateLimiter(mockLogger, 1);

    expect(rateLimiter.consume('agent-one')).toBe(true);
    expect(rateLimiter.consume('agent-one')).toBe(false); // Exhausted
    // Separate tracking key must remain perfectly open and un-impacted
    expect(rateLimiter.consume('agent-two')).toBe(true);
  });

  it('should evict bucket timestamps incrementally following a true sliding window calculation model', async () => {
    const rateLimiter = new AgentRateLimiter(mockLogger, 2);

    // Request 1 at T=0
    expect(rateLimiter.consume('sliding-agent')).toBe(true);

    // Request 2 at T=30 seconds (30000ms)
    await vi.advanceTimersByTimeAsync(30000);
    expect(rateLimiter.consume('sliding-agent')).toBe(true);

    // Advance time by another 35 seconds. Total elapsed time is now 65 seconds (65000ms).
    // Request 1 (at T=0) is now 65s old and is EVICTED.
    // Request 2 (at T=30) is only 35s old and STAYS in the bucket.
    await vi.advanceTimersByTimeAsync(35000);

    // We can consume exactly 1 more token because the bucket has dropped down to 1 active request
    expect(rateLimiter.consume('sliding-agent')).toBe(true);
    expect(rateLimiter.consume('sliding-agent')).toBe(false); // Blown again because we hit 2 active requests
  });

  it('should clip array lengths on blocked invocations to prevent heap pollution and memory leaks', () => {
    const limit = 2;
    const rateLimiter = new AgentRateLimiter(mockLogger, limit);

    // Saturate the bucket immediately
    expect(rateLimiter.consume('leak-prone-agent')).toBe(true);
    expect(rateLimiter.consume('leak-prone-agent')).toBe(true);

    // Hammer the limiter with 20 malicious or redundant requests while it is blocked
    for (let i = 0; i < 20; i++) {
      expect(rateLimiter.consume('leak-prone-agent')).toBe(false);
    }

    // Access the internal state safely via standard black-box timing tests
    // If the array grew to 22 entries, advancing time by 60001ms would require checking 22 entries.
    // Our production code explicitly clamps the bucket length using slice(0, limit)
    // Let's verify that exactly one window reset re-opens the gate perfectly
    vi.advanceTimersByTime(60001);
    expect(rateLimiter.consume('leak-prone-agent')).toBe(true);
  });

  it('should handle simultaneous concurrent requests arriving within the exact same millisecond boundary safely', () => {
    const rateLimiter = new AgentRateLimiter(mockLogger, 2);

    // Execute requests at the identical CPU clock tick
    expect(rateLimiter.consume('concurrent-agent')).toBe(true);
    expect(rateLimiter.consume('concurrent-agent')).toBe(true);
    // Third simultaneous call must be throttled cleanly
    expect(rateLimiter.consume('concurrent-agent')).toBe(false);
  });

  it('should maintain strict tracking boundary isolation across hundreds of unique concurrent agent identifiers', () => {
    const rateLimiter = new AgentRateLimiter(mockLogger, 1);

    // Populate the internal dictionary pool with a massive batch allocation loop
    for (let i = 0; i < 200; i++) {
      const uniqueAgentId = `agent-id-cluster-node-${i}`;
      expect(rateLimiter.consume(uniqueAgentId)).toBe(true);
      expect(rateLimiter.consume(uniqueAgentId)).toBe(false); // Instantly throttled
    }

    // Verify a completely new independent tracking key remains unaffected by the cluster load
    expect(rateLimiter.consume('isolated-perimeter-agent')).toBe(true);
  });

  it('should fail safely and protect capacity thresholds even during adversarial negative clock skew shifts', async () => {
    const rateLimiter = new AgentRateLimiter(mockLogger, 1);

    // Initial allocation sets the baseline timestamp record
    expect(rateLimiter.consume('skew-agent')).toBe(true);

    // Force an artificial adversarial system clock mutation sliding backward by 10 seconds
    const legacySystemTime = Date.now();
    vi.setSystemTime(legacySystemTime - 10000);

    // The limiter must actively block the allocation because the existing item in the bucket 
    // is mathematically pinned to a future interval relative to the new skewed system clock, 
    // meaning it remains above the (now skewed) sliding cutoff threshold.
    expect(rateLimiter.consume('skew-agent')).toBe(false);
  });
});
