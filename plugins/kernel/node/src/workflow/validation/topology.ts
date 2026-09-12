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
import { END, WorkflowDefinition } from '../../types/workflow/definition';
import type { WorkflowValidationViolation, ValidationRule } from '../../types/workflow/validationRules';

/**
 * Encapsulates the state and graph traversal logic required to perform
 * Depth-First Search (DFS) analysis on a workflow topology.
 *
 * This class isolates cyclic tracking and reachability detection away from the
 * stateless validation wrapper to maintain a clean and low cyclomatic complexity profile.
 */
export class TopologyTraversal {
  /** Tracks nodes visited during the lifespan of the entire traversal process. */
  private visited = new Set<string>();

  /** Tracks nodes in the current execution stack path to catch infinite cyclic loops. */
  private stack = new Set<string>();

  /** Indicates whether at least one execution trajectory reaches a terminal end state. */
  public hasTerminalPath = false;

  /**
   * Initializes a new instance of the TopologyTraversal utility class.
   *
   * @param outgoing - A map capturing each node and its explicit list of child targets.
   * @param nodeNames - The complete set of valid node keys declared in the workflow.
   */
  constructor(
    private outgoing: Map<string, Set<string | symbol>>,
    private nodeNames: Set<string>
  ) {}

  /**
   * Recursively executes a Depth-First Search across nodes starting from a root node.
   * Modifies the internal `visited`, `stack`, and `hasTerminalPath` state variables during traversal.
   *
   * @param current - The name identifier of the node currently undergoing evaluation.
   * @returns void
   */
  public traverse(current: string): void {
    if (this.stack.has(current) || this.visited.has(current)) return;

    this.visited.add(current);
    this.stack.add(current);

    const targets = this.outgoing.get(current)!;

    // Treat explicit END or code-driven __DYNAMIC__ conditional routers
    // as valid trajectories capable of exiting the static tracking routine.
    if (targets.has(END) || targets.has('__DYNAMIC__')) {
      this.hasTerminalPath = true;
    }

    for (const target of targets) {
      if (typeof target === 'string' && target !== '__DYNAMIC__' && this.nodeNames.has(target)) {
        this.traverse(target);
      }
    }

    this.stack.delete(current);
  }

  /**
   * Compares the absolute declared node names against the set of traversed nodes
   * to identify structural orphans.
   *
   * @returns An array containing string names of nodes that could not be reached.
   */
  public getUnreachableNodes(): string[] {
    const unreachable: string[] = [];
    this.nodeNames.forEach(node => {
      if (!this.visited.has(node)) unreachable.push(node);
    });
    return unreachable;
  }
}

/**
 * Transforms an array of edge definitions into a high-performance adjacency map.
 *
 * Unmapped/conditional function paths that do not expose a static 'to' target 
 * are classified under the token marker string `__DYNAMIC__`.
 *
 * @param edges - The collection of configured edges pulled from the workflow specification.
 * @param nodeNames - The complete set of verified node names declared in the workflow.
 * @returns A structured Map plotting nodes to their corresponding set of targets.
 */
export function buildAdjacencyMap(edges: WorkflowDefinition<any, any>['edges'], nodeNames: Set<string>) {
  const outgoing = new Map<string, Set<string | symbol>>();
  nodeNames.forEach(node => outgoing.set(node, new Set()));

  for (const edge of edges || []) {
    if (nodeNames.has(edge.from)) {
      const target = 'to' in edge ? edge.to : '__DYNAMIC__';
      outgoing.get(edge.from)!.add(target);
    }
  }
  return outgoing;
}

/**
 * A validation rule that analyzes a workflow's architectural topology.
 *
 * This method runs a static analysis pass over the graph structure to proactively
 * catch design flaws before runtime execution. It checks for:
 *
 * - **Dead Ends**: Nodes missing an operational exit trajectory.
 * - **Self-looping Dead Ends**: Sinks pointing directly back to themselves, masquerading as active.
 * - **Orphans**: Sub-graphs detached entirely from the root execution path.
 * - **Infinite Cyclic Traps**: Closed structural loops that have no exit to `END`.
 *
 * @param def - The full underlying workspace workflow definition object.
 * @param nodeNames - A processed pre-calculated Set of valid node keys.
 * @param workflowId - The parsed tracker string of the target workflow.
 * @returns An array containing discovered topological structure violations.
 */
export const checkTopology: ValidationRule = (def, nodeNames, workflowId) => {
  const hasEdges = Array.isArray(def.edges) && def.edges.length > 0;
  const outgoing = buildAdjacencyMap(def.edges, nodeNames);
  const errors: WorkflowValidationViolation[] = [];

  // 1. Hardened Dead End & Self-Loop Validation
  for (const node of nodeNames) {
    const targets = outgoing.get(node)!;

    if (targets.size === 0) {
      errors.push({ message: `Workflow '${workflowId}' contains a dead-end at node '${node}'` });
    } else if (targets.size === 1 && targets.has(node)) {
      errors.push({ message: `Workflow '${workflowId}' contains a self-looping dead-end at node '${node}'` });
    }
  }

  if (!nodeNames.has(def.entryNode)) return errors;

  // 2. Traversal Analysis
  const traversal = new TopologyTraversal(outgoing, nodeNames);
  traversal.traverse(def.entryNode);

  // 3. Unreachable orphans
  for (const orphan of traversal.getUnreachableNodes()) {
    errors.push({ message: `Workflow '${workflowId}' contains an unreachable orphan node '${orphan}'` });
  }

  // 4. Infinite Traps Validation
  // Count only standard structural dead-ends (excluding self-loops which represent active cycles)
  const structuralDeadEnds = errors.filter(e => !e.message.includes('self-looping'));

  if (!traversal.hasTerminalPath && hasEdges && structuralDeadEnds.length === 0) {
    errors.push({ message: `Workflow '${workflowId}' is an infinite cyclic trap; no trajectory reaches 'END'` });
  }

  return errors;
};
