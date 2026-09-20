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
import path from 'path';
import { createRequire } from 'module';
import { describe, it, expect, beforeAll } from 'vitest';
import * as TreeSitter from 'web-tree-sitter';
import { locateHclBlocks, getOrCreateHclParser } from '../locateHcl';

const requireInterop = createRequire(__dirname);

describe('locateHcl Real WebAssembly Integration Tests', () => {
  const mockValidHclContent = `
    resource "datadog_monitor" "high_cpu_alert" {
      name    = "High CPU Usage Alert"
      message = "CPU footprint exceeds thresholds"

      threshold = "92.5"
      duration  = "5m"
    }

    resource "pagerduty_service_integration" "ignored_block" {
      name = "dummy-integration"
    }
  `;

  const mockAlternativeNamesHclContent = `
    resource "aws_cloudwatch_metric_alarm" "memory_leak" {
      alarm_name = "low-memory-condition"

      value  = "85"
      period = "300"
    }
  `;

  beforeAll(async () => {
    const packageMain = requireInterop.resolve('web-tree-sitter');
    const packageDir = path.dirname(packageMain);
    const coreWasmPath = path.join(packageDir, 'web-tree-sitter.wasm');

    // Initialize WebAssembly engine through the explicit Parser class type schema
    await TreeSitter.Parser.init({
      locateFile: () => coreWasmPath
    });

    await getOrCreateHclParser();
  });

  describe('Real AST Processing Core Logic', () => {
    it('should query real HCL AST nodes and map variables correctly', async () => {
      const result = await locateHclBlocks(mockValidHclContent, 'datadog_monitor.high_cpu_alert');

      expect(result).toBeDefined();
      expect(result?.blockName).toBe('datadog_monitor.high_cpu_alert');

      expect(result?.currentThreshold).toEqual({
        value: '92.5',
        line: 6,
        raw: expect.stringContaining('threshold = "92.5"')
      });

      expect(result?.currentDuration).toEqual({
        value: '5m',
        line: 7,
        raw: expect.stringContaining('duration  = "5m"')
      });
    });

    it('should map block components identically with normalization parameters applied', async () => {
      const result = await locateHclBlocks(mockValidHclContent, 'Datadog-Monitor___HIGH-cpu-ALERT');
      expect(result?.blockName).toBe('datadog_monitor.high_cpu_alert');
    });

    it('should capture provider aliases like value/period natively using the grammar query maps', async () => {
      const result = await locateHclBlocks(mockAlternativeNamesHclContent, 'aws_cloudwatch_metric_alarm.memory_leak');

      expect(result).toBeDefined();
      expect(result?.blockName).toBe('aws_cloudwatch_metric_alarm.memory_leak');
      expect(result?.currentThreshold?.value).toBe('85');
      expect(result?.currentDuration?.value).toBe('300');
    });

    it('should exit cleanly returning undefined for unmatched entities', async () => {
      const result = await locateHclBlocks(mockValidHclContent, 'non_existent_resource.missing_name');
      expect(result).toBeUndefined();
    });

    it('should handle structural omissions within full valid grammar structures', async () => {
      const result = await locateHclBlocks(mockValidHclContent, 'pagerduty_service_integration.ignored_block');

      expect(result).toBeDefined();
      expect(result?.blockName).toBe('pagerduty_service_integration.ignored_block');
      expect(result?.currentThreshold).toBeUndefined();
      expect(result?.currentDuration).toBeUndefined();
    });
  });
});
