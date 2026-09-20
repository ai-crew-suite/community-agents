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
import { parseDocument, LineCounter, visit, Pair, YAMLMap, Node } from 'yaml';
import type { AnchorField } from './state';

/**
 * Structural payload returned by the Prometheus YAML layout parsing engine.
 */
export interface YamlLocateResult {
  /** The isolated alert block name label matching the target query criteria. */
  blockName: string;
  /** Extracted execution expression criteria if discovered. */
  currentThreshold?: AnchorField;
  /** Extracted static duration criteria if discovered. */
  currentDuration?: AnchorField;
}

/**
 * Orchestrator class responsible for parsing and analyzing Prometheus Alerting rules 
 * via single-pass YAML Abstract Syntax Tree (AST) exploration.
 */
class YamlAlertBlockLocator {
  private readonly lineCounter = new LineCounter();
  private readonly normalizedTarget: string;
  private currentThreshold?: AnchorField;
  private currentDuration?: AnchorField;

  constructor(
    private readonly content: string,
    targetAlertName: string
  ) {
    this.normalizedTarget = this.normalize(targetAlertName);
  }

  /**
   * Executes a single-pass structural AST traversal over the source document layout.
   *
   * @returns The resolved locate structural overview mapping, or undefined if malformed or missing.
   */
  public execute(): YamlLocateResult | undefined {
    const doc = parseDocument(this.content, { lineCounter: this.lineCounter });
    if (doc.errors.length > 0) return undefined;

    let discoveredAlertName: string | undefined = undefined;

    visit(doc, {
      Map: (_, map: YAMLMap) => {
        if (this.isMatchingAlertBlock(map)) {
          discoveredAlertName = this.extractAttributesFromMap(map);
          return visit.BREAK;
        }
        return undefined;
      }
    });

    if (!discoveredAlertName) return undefined;

    return {
      blockName: discoveredAlertName,
      currentThreshold: this.currentThreshold,
      currentDuration: this.currentDuration,
    };
  }

  /**
   * Normalizes strings to enable soft-matching properties across configurations.
   */
  private normalize(val: string): string {
    return val.toLowerCase().replace(/[^a-z0-9]+/g, '');
  }

  /**
   * Assesses whether a YAML map block represents our specific targeted Prometheus alerting rule entry.
   */
  private isMatchingAlertBlock(map: YAMLMap): boolean {
    const alertPair = map.items.find((item: Pair) => item.key?.toString() === 'alert');
    if (!alertPair || !alertPair.value) return false;

    const alertName = alertPair.value.toString();
    return this.normalize(alertName) === this.normalizedTarget;
  }

  /**
   * Parses the matching alert rule block map to bind threshold anchors and windows.
   *
   * @returns The actual string identity value assigned to the 'alert' key.
   */
  private extractAttributesFromMap(map: YAMLMap): string {
    let alertName = '';

    for (const item of map.items) {
      const key = item.key?.toString();
      const valueNode = item.value;

      if (!key || !valueNode) continue;

      if (key === 'alert') {
        alertName = valueNode.toString();
      } else {
        this.processMetricAttribute(key, valueNode as Node);
      }
    }

    return alertName;
  }

  /**
   * Evaluates alert configuration attributes to extract coordinates and metrics data.
   */
  private processMetricAttribute(key: string, valueNode: Node): void {
    const valueStr = valueNode.toString() ?? '';
    const range = valueNode.range;
    if (!range || typeof range[0] !== 'number') return;

    const linePos = this.lineCounter.linePos(range[0]);
    const anchor: AnchorField = {
      value: valueStr,
      line: linePos.line,
      raw: `${key}: ${valueStr}`
    };

    if (key === 'expr') {
      const numMatch = /-?\d+(?:\.\d+)?/.exec(valueStr);
      if (numMatch && numMatch[0]) {
        // FIXED: Extract the raw string element instead of binding the match metadata collection array
        anchor.value = numMatch[0];
      }
      this.currentThreshold = anchor;
    } else if (key === 'for') {
      this.currentDuration = anchor;
    }
  }
}

/**
 * Entry facade pattern exposing public functional access to the YAML alerting rule search orchestrator.
 *
 * @param content Target raw source code layout string of an alert rules mapping asset.
 * @param targetAlertName Structural reference block name token.
 * @returns The resolved locate structural overview mapping, or undefined.
 */
export function locateYamlBlocks(content: string, targetAlertName: string): YamlLocateResult | undefined {
  const locator = new YamlAlertBlockLocator(content, targetAlertName);
  return locator.execute();
}
