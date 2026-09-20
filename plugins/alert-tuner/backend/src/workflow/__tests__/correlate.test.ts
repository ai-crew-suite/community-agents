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
import { describe, it, expect } from 'vitest';
import { overlaps, applySuppression } from '../correlate';
import type { FiringSample, NoiseScore } from '../state';

describe('correlate Core Suppression Invariants Unit Tests', () => {
  // FIXED: Supplied all mandatory statistical invariant properties required by NoiseScore
  const baseScore: NoiseScore = {
    samples: 10,
    autoResolveRatio: 0.8,
    medianSelfClearSeconds: 120,
    p90SelfClearSeconds: 300,
    pagedRatio: 0.2,
    verdict: 'noisy',
    suppressedBy: [],
  };

  // FIXED: Aligned resolution with the strict 'auto' | 'manual' | 'unresolved' enum specification
  const validSample: FiringSample = {
    id: 'fire-1',
    triggeredAt: '2026-08-25T14:00:00Z',
    resolvedAt: '2026-08-25T14:30:00Z',
    resolution: 'auto',
    paged: true,
  };

  describe('Strict Date Format Boundary Logic', () => {
    it('should reject non-deterministic partial timestamps or invalid input shapes cleanly', () => {
      // FIXED: Aligned resolution enum here as well ('unresolved')
      const corruptSample: FiringSample = {
        id: 'fire-corrupt',
        triggeredAt: 'just-the-year-2026', 
        resolution: 'unresolved',
        paged: false,
      };

      const validWindow = {
        id: 'inc-1',
        start: '2026-08-25T14:00:00Z',
      };

      const result = overlaps(corruptSample, validWindow, 15);
      expect(result).toBe(false);
    });

    it('should handle standard complete ISO calendar structures accurately', () => {
      const validWindow = {
        id: 'inc-1',
        start: '2026-08-25T13:50:00Z',
        end: '2026-08-25T14:10:00Z',
      };

      const result = overlaps(validSample, validWindow, 0);
      expect(result).toBe(true);
    });
  });

  describe('Symmetric Overlap and Padding Matrix', () => {
    it('should catch a firing that matches completely inside a suppressed interval', () => {
      const tightWindow = {
        id: 'inc-1',
        start: '2026-08-25T13:45:00Z',
        end: '2026-08-25T14:45:00Z',
      };

      expect(overlaps(validSample, tightWindow, 0)).toBe(true);
    });

    it('should correctly capture adjacent edge intervals using configured tolerance buffers', () => {
      const separateWindow = {
        id: 'inc-2',
        start: '2026-08-25T14:40:00Z', 
        end: '2026-08-25T15:00:00Z',
      };

      expect(overlaps(validSample, separateWindow, 0)).toBe(false);
      expect(overlaps(validSample, separateWindow, 15)).toBe(true);
    });
  });

  describe('Suppression Pipeline Execution', () => {
    it('should accurately flip noise verdicts to real_signal when anomalies match correlation items', () => {
      const windows = [
        { id: 'inc-1', start: '2026-08-25T13:50:00Z', end: '2026-08-25T14:10:00Z' }
      ];

      const optimizedScore = applySuppression(baseScore, [validSample], windows, 0);

      expect(optimizedScore.verdict).toBe('real_signal');
      expect(optimizedScore.suppressedBy).toContain('inc-1');
    });

    it('should retain pristine legacy structures intact if no active tracking matches occur', () => {
      const clearWindows = [
        { id: 'inc-99', start: '2026-01-01T00:00:00Z' }
      ];

      const unchangedScore = applySuppression(baseScore, [validSample], clearWindows, 0);
      expect(unchangedScore).toEqual(baseScore);
    });
  });
});
