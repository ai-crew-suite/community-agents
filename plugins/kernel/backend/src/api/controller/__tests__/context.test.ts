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
import { mockServices } from '@backstage/backend-test-utils';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorkflowContextFactory } from '../context';

describe('WorkflowContextFactory - Internal Core Helper Logic Mechanics', () => {
  let mockLogger: any;
  let factory: WorkflowContextFactory;

  beforeEach(() => {
    vi.clearAllMocks();

    mockLogger = mockServices.logger.mock();

    // Instantiate the WorkflowContextFactory directly to test the business methods in isolation
    factory = new WorkflowContextFactory({
      agents: new Map(),
      augmentationIndexer: {} as any,
      httpAuth: {} as any,
      logger: mockLogger,
      permissions: {} as any,
      runtime: {} as any,
      toolRegistry: {} as any,
      hardening: { rateLimitPerMinute: 0 } // default state baseline
    });
  });

  describe('validateSource Utility Logic', () => {
    it('should map empty, undefined, or explicitly general inputs back to the default "all" string target', () => {
      expect((factory as any).validateSource(undefined)).toBe('all');
      expect((factory as any).validateSource('   ')).toBe('all');
      expect((factory as any).validateSource('all')).toBe('all');
    });

    it('should return the raw identifier string intact when processing discrete custom source tags', () => {
      expect((factory as any).validateSource('github-enterprise-vcs')).toBe('github-enterprise-vcs');
    });
  });

  describe('consumeRateLimit High-Throughput Mechanism', () => {
    it('should pass immediately if rate limiting configuration parameters are absent or disabled', () => {
      // Simulate unconfigured hardening options mapping properties directly on the internal config block
      (factory as any).options.hardening = {};
      const result = (factory as any).consumeRateLimit('mock-agent-id');
      expect(result).toBe(true);
    });

    it('should successfully block execution requests when invocations cross the specified threshold metric bounds', () => {
      (factory as any).options.hardening = { rateLimitPerMinute: 3 };

      // Seed historical invocation timestamps directly into private factory memory cache maps
      const now = Date.now();
      (factory as any).rateLimitBucket.set('test-agent', [now, now - 1000, now - 2000]);

      const result = (factory as any).consumeRateLimit('test-agent');

      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Governance Boundary Triggered')
      );
    });

    it('should truncate and slice the bucket size under flood conditions to prevent memory exhaustion DoS vectors', () => {
      (factory as any).options.hardening = { rateLimitPerMinute: 2 };
      const now = Date.now();

      // Inject an over-allocated array mimicking flood traffic attempts
      (factory as any).rateLimitBucket.set('flooded-agent', [now, now, now, now, now, now]);

      const result = (factory as any).consumeRateLimit('flooded-agent');
      expect(result).toBe(false);

      // Verify array slicing limits are applied correctly
      const trackedBucket = (factory as any).rateLimitBucket.get('flooded-agent');
      expect(trackedBucket.length).toBe(2);
    });
  });

  describe('parseLastEventId Index Extraction Routing', () => {
    it('should default to zero index baselines if the incoming tracking string parameter evaluates as empty', () => {
      expect((factory as any).parseLastEventId(undefined)).toBe(0);
      expect((factory as any).parseLastEventId('  ')).toBe(0);
    });

    it('should parse valid base-10 numerical strings smoothly into raw numeric primitives', () => {
      expect((factory as any).parseLastEventId('42')).toBe(42);
    });

    it('should default safely to zero and raise warning logs if processing negative or fractional input metrics', () => {
      expect((factory as any).parseLastEventId('-15')).toBe(0);
      expect((factory as any).parseLastEventId('12.58')).toBe(0);
      expect((factory as any).parseLastEventId('corrupted-string-payload')).toBe(0);
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  describe('fromStoredStep Database Serialization Layer Protection', () => {
    it('should reject unmapped or corrupted string type classifications with an explicit error log statement', () => {
      const result = (factory as any).fromStoredStep('malicious_override_attack', { payload: true });

      expect(result).toBeUndefined();
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should cleanly yield valid, structured AgentEvent records when processing standard recorded data inputs', () => {
      const mockPayload = { runId: 'run_abc', node: 'node_1', text: 'Hello word' };
      const result = (factory as any).fromStoredStep('token', mockPayload);

      expect(result).toBeDefined();
      expect(result?.type).toBe('token');
      expect(result?.data).toBe(mockPayload);
    });
  });
});
