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
import fs from 'fs';
import * as TreeSitter from 'web-tree-sitter'; 
import type { AnchorField } from './state';

/**
 * Structural payload returned by the HCL layout scanning engine.
 */
export interface HclLocateResult {
  /** The fully qualified target block name identified (e.g. 'datadog_monitor.high_cpu_alert'). */
  blockName: string;
  /** Extracted alert threshold metrics context if discovered. */
  currentThreshold?: AnchorField;
  /** Extracted alert duration / time-window parameters if discovered. */
  currentDuration?: AnchorField;
}

let initializedParser: TreeSitter.Parser | undefined = undefined;

/**
 * Retrieves or initializes a global singleton instance of the Web-Tree-Sitter parser,
 * pre-wired with the underlying Terraform HCL grammar WebAssembly bytecode.
 * 
 * @returns A fully configured TreeSitter Parser instance.
 * @throws {Error} If the required .wasm grammar asset cannot be located on the local file system.
 */
export async function getOrCreateHclParser(): Promise<TreeSitter.Parser> {
  if (initializedParser) return initializedParser;

  await TreeSitter.Parser.init();
  const parser = new TreeSitter.Parser();
  let wasmPath: string;

  try {
    const packageJsonPath = require.resolve('@tree-sitter-grammars/tree-sitter-hcl/package.json');
    const packageDir = path.dirname(packageJsonPath);
    wasmPath = path.join(packageDir, 'tree-sitter-hcl.wasm');
  } catch {
    wasmPath = path.resolve(__dirname, '../node_modules/@tree-sitter-grammars/tree-sitter-hcl/tree-sitter-hcl.wasm');
  }

  if (!fs.existsSync(wasmPath)) {
    throw new Error(`[HCL-Parser] WebAssembly target grammar asset missing at expected path: ${wasmPath}`);
  }

  const HCL = await TreeSitter.Language.load(wasmPath);
  parser.setLanguage(HCL);
  initializedParser = parser;
  return parser;
}

/**
 * Orchestrator class responsible for navigating a target HCL file's Abstract Syntax Tree
 * to isolate monitoring resources and extract metric thresholds or window parameters.
 */
class HclAlertBlockLocator {
  private readonly lines: string[];
  private readonly normalizedTarget: string;
  private currentThreshold?: AnchorField;
  private currentDuration?: AnchorField;

  constructor(
    private readonly content: string,
    targetAlertName: string
  ) {
    this.lines = content.split('\n');
    this.normalizedTarget = this.normalize(targetAlertName);
  }

  /**
   * Executes the full AST scan pipeline over the configured source buffer.
   *
   * @param parser The pre-warmed TreeSitter parser engine.
   * @returns The structural locate overview, or undefined if the target resource is missing.
   */
  public execute(parser: TreeSitter.Parser): HclLocateResult | undefined {
    const tree = parser.parse(this.content);
    if (!tree || !tree.rootNode) return undefined;

    const blockMatch = this.findTargetBlockNode(tree);
    if (!blockMatch) return undefined;

    this.extractAttributesFromBlock(blockMatch.node);

    return {
      blockName: blockMatch.detectedName,
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
   * Executes a Tree-Sitter schema query pattern to isolate matching target block fragments.
   */
  private findTargetBlockNode(tree: TreeSitter.Tree): { node: TreeSitter.Node; detectedName: string } | undefined {
    const queryStr = `
      (block
        (identifier) @block_type
        (string_lit) @resource_type
        (string_lit) @resource_name
      ) @alert_block
    `;

    const query = new TreeSitter.Query(tree.language, queryStr);
    const matches = query.matches(tree.rootNode);

    for (const match of matches) {
      const captures = match.captures;
      const rType = captures.find((c) => c.name === 'resource_type')?.node.text.replace(/"/g, '') ?? '';
      const rName = captures.find((c) => c.name === 'resource_name')?.node.text.replace(/"/g, '') ?? '';
      const blockRefName = `${rType}.${rName}`;

      if (this.normalize(blockRefName).includes(this.normalizedTarget) || this.normalizedTarget.includes(this.normalize(blockRefName))) {
        const blockNode = captures.find((c) => c.name === 'alert_block')?.node;
        if (blockNode) {
          return { node: blockNode, detectedName: blockRefName };
        }
      }
    }

    return undefined;
  }

  /**
   * Safe entry pointer that locates the body of a block and loops through its attributes.
   */
  private extractAttributesFromBlock(blockNode: TreeSitter.Node): void {
    let bodyNode: TreeSitter.Node | null = null;
    for (let i = 0; i < blockNode.childCount; i++) {
      const child = blockNode.child(i);
      if (child && child.type === 'body') {
        bodyNode = child;
        break;
      }
    }

    const searchNode = bodyNode ?? blockNode;

    for (let i = 0; i < searchNode.childCount; i++) {
      const child = searchNode.child(i);
      if (child && child.type === 'attribute') {
        this.processAttributeNode(child);
      }
    }
  }

  /**
   * Resolves the assignment sequence of an attribute and maps tracking anchors to internal state.
   */
  private processAttributeNode(attrNode: TreeSitter.Node): void {
    const attrName = attrNode.child(0)?.text ?? '';
    const attrValueNode = this.findAttributeValueNode(attrNode);
    if (!attrValueNode) return;

    const targetLineNumber = attrNode.startPosition.row + 1;
    const rawLineText = this.lines[attrNode.startPosition.row] ?? '';
    const assignedValue = attrValueNode.text.replace(/"/g, '');

    const anchor: AnchorField = {
      value: assignedValue,
      line: targetLineNumber,
      raw: rawLineText,
    };

    const normalizedName = attrName.toLowerCase();
    if (['threshold', 'value', 'critical'].includes(normalizedName)) {
      this.currentThreshold = anchor;
    } else if (['duration', 'for', 'period'].includes(normalizedName)) {
      this.currentDuration = anchor;
    }
  }

  /**
   * Scans a target attribute node to dynamically discover the token positioned after the equal operator.
   */
  private findAttributeValueNode(attrNode: TreeSitter.Node): TreeSitter.Node | null {
    let foundAssignment = false;

    for (let i = 0; i < attrNode.childCount; i++) {
      const child = attrNode.child(i);
      if (!child) continue;

      if (child.text === '=') {
        foundAssignment = true;
        continue;
      }

      if (foundAssignment) {
        return child;
      }
    }

    return null;
  }
}

/**
 * Entry facade pattern exposing public functional access to the block search orchestration pipeline.
 *
 * @param content Target raw source code layout string of an HCL tracking asset.
 * @param targetAlertName Structural reference block signature identifier target.
 * @returns The resolved locate structural overview mapping context blocks.
 */
export async function locateHclBlocks(
  content: string,
  targetAlertName: string
): Promise<HclLocateResult | undefined> {
  const parser = await getOrCreateHclParser();
  const locator = new HclAlertBlockLocator(content, targetAlertName);
  return locator.execute(parser);
}
