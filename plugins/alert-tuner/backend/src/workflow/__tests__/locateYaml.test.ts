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
import { locateYamlBlocks } from '../locateYaml';

describe('locateYaml Backend Engine Unit Tests', () => {
  const mockValidYamlContent = `
groups:
  - name: host-metrics
    rules:
      - alert: HighCpuUsage
        expr: instance:cpu_utilization:ratio * 100 > 92.5
        for: 5m
        labels:
          severity: critical
      - alert: LowDiskSpace
        expr: node_filesystem_free_bytes < 1000000000
        for: 15m
  `;

  const mockMalformedYamlContent = `
groups:
  - name: invalid-syntax
    rules:
      - alert: BrokenRule
        expr: [unclosed brackets
      broken: : syntax: error
  `;

  describe('Real AST Processing Core Logic', () => {
    it('should correctly isolate a YAML block, extract token elements, and bind threshold line markers', () => {
      const result = locateYamlBlocks(mockValidYamlContent, 'HighCpuUsage');

      expect(result).toBeDefined();
      expect(result?.blockName).toBe('HighCpuUsage');

      expect(result?.currentThreshold).toEqual({
        value: '100', // Captures first matched numerical element inside expression
        line: 6,
        raw: 'expr: instance:cpu_utilization:ratio * 100 > 92.5'
      });

      expect(result?.currentDuration).toEqual({
        value: '5m',
        line: 7,
        raw: 'for: 5m'
      });
    });

    it('should flexibly match rule naming definitions using soft normalization logic', () => {
      const result = locateYamlBlocks(mockValidYamlContent, 'high-cpu-usage');
      expect(result?.blockName).toBe('HighCpuUsage');
    });

    it('should return undefined cleanly if the target rule does not exist inside the document payload', () => {
      const result = locateYamlBlocks(mockValidYamlContent, 'MissingAlertRuleName');
      expect(result).toBeUndefined();
    });

    it('should return undefined gracefully if the incoming configuration block contains syntax compilation errors', () => {
      const result = locateYamlBlocks(mockMalformedYamlContent, 'BrokenRule');
      expect(result).toBeUndefined();
    });
  });
});
