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
import { locateThresholdAnchor } from '../locate';

const requireInterop = createRequire(__dirname);

describe('locateThresholdAnchor Orchestration Router Integration Tests', () => {
  const mockYamlContent = `
groups:
  - name: platform-alerts
    rules:
      - alert: HighMemoryUsage
        expr: memory_ratio > 90
        for: 2m
  `;

  const mockHclContent = `
    resource "datadog_monitor" "high_cpu" {
      threshold = "95"
      duration  = "5m"
    }
  `;

  const mockUntunableHclContent = `
    resource "datadog_monitor" "empty_monitor" {
      name = "blank-alert"
    }
  `;

  beforeAll(async () => {
    // Core setup to ensure the underlying HCL WebAssembly engine can initialize during integration tests
    const packageMain = requireInterop.resolve('web-tree-sitter');
    const packageDir = path.dirname(packageMain);
    const coreWasmPath = path.join(packageDir, 'web-tree-sitter.wasm');

    await TreeSitter.Parser.init({
      locateFile: () => coreWasmPath
    });
  });

  it('should route .yaml files to the YAML parser and return a type-safe true anchor payload', async () => {
    const result = await locateThresholdAnchor({
      path: 'deployments/prometheus-rules.yaml',
      content: mockYamlContent,
      alertName: 'HighMemoryUsage',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.anchor.blockName).toBe('HighMemoryUsage');
      expect(result.anchor.currentDuration?.value).toBe('2m');
    }
  });

  it('should route non-yaml files to the HCL parser and return a type-safe true anchor payload', async () => {
    const result = await locateThresholdAnchor({
      path: 'terraform/monitors.tf',
      content: mockHclContent,
      alertName: 'datadog_monitor.high_cpu',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.anchor.blockName).toBe('datadog_monitor.high_cpu');
      expect(result.anchor.currentThreshold?.value).toBe('95');
    }
  });

  it('should return a clean locate failure payload if a matching block cannot be discovered', async () => {
    const result = await locateThresholdAnchor({
      path: 'terraform/monitors.tf',
      content: mockHclContent,
      alertName: 'non_existent_alert_signature',
    });

    expect(result).toEqual({
      ok: false,
      reason: 'no_match',
      matches: 0,
    });
  });

  it('should return a no_tunable_field failure code if the resource exists but specifies no adjustable thresholds', async () => {
    const result = await locateThresholdAnchor({
      path: 'terraform/monitors.tf',
      content: mockUntunableHclContent,
      alertName: 'datadog_monitor.empty_monitor',
    });

    expect(result).toEqual({
      ok: false,
      reason: 'no_tunable_field',
      matches: 1,
    });
  });
});
