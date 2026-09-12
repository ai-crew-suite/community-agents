# Developer Guide: Kernel Node Test Utilities

This documentation covers the core **testing utilities, domain validation engines, entity transformers, and data security services** located within the kernel node-library plugin of this **Spotify Backstage** monorepo. Together, these tools form the core infrastructure layer that allows your **18 agentic workflow plugins** to execute safely, process catalog schemas reliably, sanitize telemetry tracking streams, and validate graph structures before execution.

## 1. Testing Utilities

### 1.1 Driver Invariant Contract Testing

**File Path:** `plugins/kernel/node/src/testUtils/contractTests.ts`

This utility provides an automated, reusable test suite scaffold (`defineDriverContractTests`) designed to enforce structural safety invariants on all custom capability drivers (e.g., Vector Stores, Caches, or LLM providers) developed across your 18 agentic plugins.

#### Core Safety Invariants Enforced

- **Identity Integrity:** Verifies that the driver provides a valid, traceable, non-empty `providerId` string.
- **Graceful Degradation:** Asserts that all operational paths return defined payloads or structured limitations rather than unhandled runtime crashes.
- **Leak Prevention:** Ensures internal provider-specific database or network client classes (e.g., native Postgres clients, internal raw buffers) do not leak into the standard communication I/O map.

#### API Reference

##### `DriverContractTestOptions<TDriver>`

Interface for the configurations required to run the automated contract suite.

| Property | Type | Description |
| --- | --- | --- |
| `category` | `string` | The functional capability group being tested (e.g., `'VectorStore'`). |
| `makeDriver` | `() => TDriver | Promise<TDriver>` | Factory function that provisions a clean, fully configured driver instance. |
| `exerciseOps` | `(driver: TDriver) => Promise<unknown[]>` | Execution hook that runs standard actions and returns an array of operational results. |

##### `defineDriverContractTests(options)`

Generates and registers standard Backstage/Jest behavior blocks (`describe`/`it`) for the driver execution path.

```typescript
export function defineDriverContractTests<TDriver extends { providerId: string }>(
  options: DriverContractTestOptions<TDriver>
): void
```

##### Usage Example

```typescript
import { defineDriverContractTests } from '@backstage/plugin-kernel-node/testUtils';
import { PostgresVectorStore } from '../drivers/PostgresVectorStore';

defineDriverContractTests({
  category: 'VectorStore',
  makeDriver: () => new PostgresVectorStore({ connectionString: 'mock://...' }),
  exerciseOps: async (driver) => {
    const searchResult = await driver.search('cluster-agent-logs', { limit: 1 });
    return [searchResult];
  }
});
```

### 1.2 Scriptable Mock Chat Model Simulation

**File Path:** `plugins/kernel/node/src/testUtils/fakeModel.ts`

This utility provides a highly deterministic, scriptable mock model framework (`FakeChatModel`) extending **LangChain’s** core `BaseChatModel`. It isolates your Backstage agentic workflows from live LLM vendor environments while permitting complex assertions on token usage, conversational tracking, and response replays.

#### Key Features

- **Sequential Replay Scripting:** Returns predefined response payloads in order of configuration across both synchronous operations (`.invoke()`) and async streaming contexts (`.stream()`).
- **Token Usage Metrics Mapping:** Injects mock `usage_metadata` blocks directly into message payloads to test billing, rate-limiting, and cost-attribution hooks.
- **Call Audit Inspection Vector:** Exposes a historical call log (`.calls`) tracking all incoming messages and configuration options received during a test life cycle.

#### API Reference

##### `FakeModelScript` & `FakeModelCallTrace`

Structural types managing step sequences and outbound invocation inspection histories.

```typescript
export type FakeModelScript = {
  text: string;
  usage?: { input: number; output: number; total: number };
};

export type FakeModelCallTrace = {
  messages: BaseMessage[];
  options: Record<string, any>;
};
```

##### `FakeChatModel`

Extends LangChain `BaseChatModel` with programmatic mock insertion.

| Property / Method | Signature | Description |
| --- | --- | --- |
| `constructor()` | `(steps?: FakeModelScript[], fields?: BaseChatModelParams)` | Instantiates the model with an optional base array of text script items. |
| `queue()` | `(step: FakeModelScript) => void` | Appends a new mock response configuration payload onto the end of the runtime queue. |
| `calls` | `FakeModelCallTrace[]` | Read-only inspection array capturing all inputs passed to the model during execution. |

##### Usage Example

```typescript
import { HumanMessage } from '@langchain/core/messages';
import { FakeChatModel } from '@backstage/plugin-kernel-node/testUtils';

// 1. Initialize with predefined steps
const mockModel = new FakeChatModel([
  { text: 'Hello! I am your agent.', usage: { input: 10, output: 5, total: 15 } },
  { text: 'I am executing your task now.', usage: { input: 15, output: 10, total: 25 } }
]);

// 2. Queue additional responses dynamically if needed
mockModel.queue({ text: 'Task completed successfully.' });

// 3. Execute step 1 via invoke
const response1 = await mockModel.invoke([new HumanMessage('Hi')]);
console.log(response1.content); // Output: "Hello! I am your agent."

// 4. Inspect calls array for testing validations
expect(mockModel.calls.length).toBe(1);
expect(mockModel.calls[0].messages[0].content).toBe('Hi');
```

### 1.3 Sandboxed Execution Context Provisioning

**File Path:** `plugins/kernel/node/src/testUtils/nodeContext.ts`

This utility provides a controlled, fully deterministic execution container (`createTestNodeContext`) that wraps Backstage’s `NodeExecutionContext`. It isolates sensitive runtime operations—such as third-party tool execution, time calculations, telemetry collection, and pipeline cancellation tracking—into a predictable sandbox suitable for unit testing.

#### Key Features

- **Tool Restrictions & Access Controls:** Implements an explicit execution allowlist (`allowedToolIds`) and automatically throws exceptions if an unlisted or unregistered tool is invoked.
- **Temporal Anchoring:** Pinpoints the internal runtime clock (`.now()`) to a static, frozen timestamp to ensure date-based logic remains stable across test runs regardless of the runner's real-world time.
- **Telemetry Extraction Matrix:** Intercepts outgoing pipeline artifacts via an isolated collection array (`capturedArtifacts`), eliminating the need to mock complex downstream logging infrastructures.
- **Native Abort Tracking:** Links directly to an `AbortSignal` token to model timeouts and host-initiated worker cancellations under standard test conditions.

#### API Reference

##### `TestNodeContextOptions`

Configuration overrides to provision the sandboxed container.

| Property | Type | Description |
| --- | --- | --- |
| `toolRegistry` | `ToolRegistry`  | *(Optional)* Registry instances containing verifiable tool definitions. |
| `allowedToolIds` | `string[]` | *(Optional)* Strict list of string identifiers authorized to run. |
| `model` | `ModelExecutor` | *(Optional)* The LLM execution bridge (typically a `FakeChatModel`). |
| `now` | `Date` | *(Optional)* Custom time anchor. Defaults to `2026-01-01T00:00:00.000Z`. |
| `logger` | `LoggerService` | *(Optional)* Backstage logger adapter. Suppresses logs by default. |
| `signal` | `AbortSignal` | *(Optional)* An external cancellation token to trigger abort paths. |

##### `TestNodeExecutionContext`

An extended context variant containing the snapshot trace block.

```typescript
export type TestNodeExecutionContext = NodeExecutionContext & {
  readonly capturedArtifacts: Array<{ kind: string; payload: unknown }>;
};
```

##### Usage Example

```typescript
import { createTestNodeContext } from '@backstage/plugin-kernel-node/testUtils';

// 1. Provision context with explicit limits and a frozen timeline
const context = createTestNodeContext({
  allowedToolIds: ['spotify-playlist-creator'],
  now: new Date('2026-09-12T00:00:00.000Z')
});

// 2. Execute workflows or nodes using the context
await context.emitArtifact('agent_decision_tree', { rule: 'fallback_triggered' });

// 3. Perform assertions on captured metrics
expect(context.capturedArtifacts.length).toBe(1);
expect(context.capturedArtifacts[0].kind).toBe('agent_decision_tree');
expect(context.now().toISOString()).toBe('2026-09-12T00:00:00.000Z');
```

### 1.4 Modular Workflow Test Runner Engine

**File Path:** `plugins/kernel/node/src/testUtils/runWorkflow.ts`

This utility features an isolated, lightweight state engine scaffold (`runWorkflow`) designed to execute complete `WorkflowDefinition` graphs under test frameworks. It provides standard lifecycle tracking, bounds checks, schema validation, and interrupt interceptions while maintaining a highly modular internal code structure.

#### Key Features

- **Infinite Loop Safeguards:** Tracks execution sequences through an iteration counters guard (`maxIterations`), actively breaking cycles and throwing explicit runtime errors before exhausting the test runner environment.
- **Schema Validation Enforcement:** Leverages internal Zod schematics (`def.inputSchema` and `def.state.schema`) to apply input validation and force state patches through structural verification steps.
- **Declarative Interrupt Gates:** Intercepts execution trajectories when a node hits an evaluation marker (`approvalRequest`), emitting synthetic human-in-the-loop lifecycle vectors seamlessly.
- **Ordered Event Logs:** Produces a comprehensive sequence trace (`AgentEvent[]`) mapping every enter, exit, and lifecycle transition point encountered during execution.

#### API Reference

##### `WorkflowRunResult<TState>`

The response payload containing execution analytics.

```typescript
export interface WorkflowRunResult<TState> {
  events: AgentEvent[];
  finalState: TState;
}
```

##### `runWorkflow(def, rawInput, ctx, maxIterations)`

Launches the execution supervisor against a target workflow specification block.

```typescript
export async function runWorkflow<TState, TInput>(
  def: WorkflowDefinition<TState, TInput>,
  rawInput: TInput,
  ctx: NodeExecutionContext,
  maxIterations = 100,
): Promise<WorkflowRunResult<TState>>
```

##### Usage Example

```typescript
import { runWorkflow } from '@backstage/plugin-kernel-node/testUtils';
import { createTestNodeContext } from './nodeContext';
import { myAgenticWorkflowDef } from '../workflows/myAgenticWorkflowDef';

describe('Agentic Workflow Execution', () => {
  it('should successfully complete linear node transitions', async () => {
    const context = createTestNodeContext();
    const inputPayload = { targetUserId: 'user-123', criteria: 'active' };

    // Run the workflow definition in the test harness
    const { events, finalState } = await runWorkflow(
      myAgenticWorkflowDef,
      inputPayload,
      context,
      25 // Maximum allowed steps before breaking
    );

    // Verify lifecycle steps match operational goals
    expect(events.some(e => e.type === 'done')).toBe(true);
    expect(finalState.isProcessingComplete).toBe(true);
  });
});
```

## Entity Transformers

### 2. Catalog Entity Transformer Service

**File Path:** `plugins/kernel/node/src/services/catalog/mapping.ts`

This service provides lightweight, pure mapping functions designed to transform raw **Backstage Catalog** entities into clean, well-formed structural summaries tailored for agentic workflows. To optimize performance and keep the core execution layer lightweight, this service uses structural duck-typing (`CatalogEntityLike`) rather than importing the heavy `@backstage/catalog-model` package.

#### Key Features

- **Structural Isolation:** Decoupled from core Backstage catalog dependencies to allow swift execution and easy test-fixture mocking.
- **Fault-Tolerant Parsing:** Tolerates missing metadata fields; malformed fields default gracefully to `'unknown'` or clean default values instead of throwing runtime exceptions.
- **Declarative Reference Extraction:** Automatically aggregates integration hooks from well-known annotations (Kubernetes IDs, monitoring dashboards, Git source repositories, source code locations, and PagerDuty targets).

#### API Reference

##### `CatalogEntityLike`

A structural shape describing the raw Backstage Catalog entity structure used for lightweight duck-typing.

```typescript
export type CatalogEntityLike = {
  apiVersion?: string;
  kind?: string;
  metadata?: {
    namespace?: string;
    name?: string;
    title?: string;
    description?: string;
    annotations?: Record<string, string>;
    tags?: string[];
  };
  spec?: {
    type?: string;
    lifecycle?: string;
    owner?: string;
    system?: string;
  } & Record<string, unknown>;
  relations?: { type?: string; targetRef?: string }[];
};
```

#### Core Transformation Utilities

| Utility Function | Input Signature | Return Type | Description |
| --- | --- | --- | --- |
| `toCatalogEntitySummary()` | `(entity: CatalogEntityLike)` | `CatalogEntitySummary` | Compresses raw entities down to compact snapshots containing unified string entity refs (e.g. `component:default/my-service`). |
| `toCatalogEntityRelations()` | `(entity: CatalogEntityLike)` | `CatalogEntityRelation[]` | Maps valid structural relationships into edge vectors while silently dropping missing or incomplete links. |
| `extractIntegrationReferences()` | `(entity: CatalogEntityLike)` | `CatalogIntegrationReferences` | Parses domain-specific annotation tags into dedicated service connection groups. |

#### Usage Example

```typescript
import { toCatalogEntitySummary, extractIntegrationReferences } from '@backstage/plugin-kernel-node/services/catalog';

const rawEntity = {
  kind: 'Component',
  metadata: {
    name: 'spotify-playback-service',
    annotations: {
      'backstage.io/kubernetes-id': 'k8s-cluster-1',
      '://github.com': 'backstage/playback-core',
      '://pagerduty.com': 'PD-ALERT-123'
    }
  },
  spec: { type: 'service', lifecycle: 'production', owner: 'team-audio' }
};

// 1. Convert to compact summary for LLM prompt injections
const summary = toCatalogEntitySummary(rawEntity);
console.log(summary.ref); // Output: "component:default/spotify-playback-service"
console.log(summary.owner); // Output: "team-audio"

// 2. Extract out integrations vectors
const integrations = extractIntegrationReferences(rawEntity);
console.log(integrations.kubernetesIds); // Output: ["k8s-cluster-1"]
console.log(integrations.oncall);        // Output: ["PD-ALERT-123"]
```

## Data Security Services

### 3. Data Redaction & Security Policy Service

**File Path:** `plugins/kernel/node/src/services/redaction/policy.ts`

This service provides an isolated security screening framework (`createRedactor`) designed to sanitize data structures across your 18 agentic plugins. It prevents accidental leaks of sensitive tokens, passwords, and credentials (e.g., inside telemetry outputs, workflow logs, or agent loop payloads) before they exit your system boundaries.

#### Key Features

- **Dual Action Reinforcement:** Supports two discrete defensive behaviors:
  - `redact`: Replaces matched content with a safe placeholder (`[REDACTED]`).
  - `reject`: Aborts execution immediately by throwing an explicit validation error if a violation is detected.
- **Deep Structural Scanning:** Recursively traverses text blobs, plain objects, and linear arrays without mutating native non-plain prototype instances (such as `Date`, `RegExp`, `AbortSignal`, or `LoggerService`).
- **Built-in Baseline Shields:** ships with `DEFAULT_REDACTION_POLICY` configured to automatically intercept common credential keys (`authorization`, `token`, `password`, `secret`) and specific token signatures (GitHub PATs, Slack tokens, AWS Access Keys).

#### API Reference

##### `RedactionPolicy`

Defines the regular expressions and enforcement mechanics applied by the scanner engine.

```typescript
export type RedactionPolicy = {
  keyPatterns: RegExp[];
  valuePatterns: RegExp[];
  mode: 'redact' | 'reject';
};
```

#### Core Functions and Constants

| Entity| Signature / Type| Description|
| --- | --- | --- |
| `DEFAULT_REDACTION_POLICY` | `RedactionPolicy`| The baseline security filter capturing standard auth credentials. |
| `createRedactor()`| `(policy: RedactionPolicy) => (value: unknown) => unknown` | Factory function compiling the policy rules into a high-performance scanner function. |

#### Usage Example

```typescript
import { createRedactor, DEFAULT_REDACTION_POLICY } from '@backstage/plugin-kernel-node/services/redaction/policy';

// Scenario 1: Using the standard redaction engine
const sanitize = createRedactor(DEFAULT_REDACTION_POLICY);

const dirtyPayload = {
  service: 'catalog-agent',
  metadata: {
    apiKey: 'super-secret-string', // Matches key pattern rule
    debugLogs: 'Connecting with token ghp_ABC123XYZ... success!' // Matches value pattern regex
  }
};

const cleanPayload = sanitize(dirtyPayload);
console.log(cleanPayload);
/* Output:
{
  service: 'catalog-agent',
  metadata: {
    apiKey: '[REDACTED]',
    debugLogs: 'Connecting with token [REDACTED]... success!'
  }
}
*/

// Scenario 2: Enforcing strict compliance rules via rejection mode
const strictSanitize = createRedactor({
  ...DEFAULT_REDACTION_POLICY,
  mode: 'reject'
});

expect(() => strictSanitize({ password: '123' })).toThrow('Redaction policy violation');
```

## 6. Workflow Core Errors & Pipeline Validation Service

**File Path:**`plugins/kernel/node/src/workflow`

This service layer encapsulates the structural health and static analysis constraints governing your agentic graphs. It provides uniform, classified runtime exceptions (`errors.ts`) alongside a modular verification pipeline (`definition.ts`, `rules.ts`) that runs static code checks against workflow schemas, nodes, edges, human interrupts, and graph topology.

### 6.1 Classed Workflow Exceptions

**File Path:** `plugins/kernel/node/src/workflow/errors.ts`

These custom error variants control workflow resilience. They ensure that runtime exceptions bubble up with explicit metadata mapping, allowing the core engine to decide when to automatically retry flaky operations and preventing internal call stack details from leaking into public telemetry logs.

#### API Reference

- **`NodeError`**: The base workflow error class. Subclasses `Error` to attach system-wide error categorizations (`ErrorCode`) and an optional engine retry configuration flag.
- **`RetryableNodeError`**: A specialized variant representing transient issues (like network hiccups or tool failures) that the engine can safely retry. Forces the `retryable` property flag to `true`.

```typescript
import { NodeError, RetryableNodeError } from '@backstage/plugin-kernel-node/workflow';

// Example: Rejecting a tool invocation due to bad input
throw new NodeError('Calculated limit must be positive', 'tool_failed', false);

// Example: Handling transient rate limits that are safe to retry
throw new RetryableNodeError('Spotify API rate limit hit. Retrying...');
```

### 6.2 Static Definition Validation Pipeline

**File Path:** `plugins/kernel/node/src/workflow/validation/`

This engine verifies graph health before execution, analyzing schemas, nodes, edges, human loops, and cycle topologies. If any static invariants are broken, it outputs a list of structural violations (`WorkflowValidationViolation[]`) to prevent runtime failure states.

Pluggable Validation Rules Matrix (`rules.ts`)

| Validation Rule | Target Objective | Success Invariant Enforced |
| --- | --- | --- |
| **`checkMetadata`** | Root Configuration Check | Verifies non-empty `id`, valid Zod `inputSchema`, valid state `schema`, and a numeric `stateVersion`. |
| **`checkGraphNodes`** | Vertex Registry Check | Asserts the workflow defines at least one vertex and that the `entryNode` maps to a registered node. |
| **`checkEdges`** | Structural Trajectory Check | Confirms all edge parameters stem from known nodes and terminate at valid nodes or the `END` symbol. |
| **`checkInterrupts`** | Human Interception Intercept Check | Checks that declarative human-in-the-loop pause gates are mapped to valid pre-node execution steps. |
| **`checkTopology`** | Graph Architecture Check | Evaluates connectivity matrix properties, detecting infinite deadlocks and unreachable nodes. |

#### Execution API Reference

- **`validateWorkflowDefinition(def)`**: Compiles the default rule collection (`VALIDATION_PIPELINE`) and maps the target definition against it in a single pass.

```typescript
export function validateWorkflowDefinition(
  def: WorkflowDefinition<any, any>
): WorkflowValidationViolation[];
```

#### Usage Example

```typescript
import { validateWorkflowDefinition } from '@backstage/plugin-kernel-node/workflow';
import { brokenWorkflowDef } from '../workflows/brokenWorkflowDef';

const violations = validateWorkflowDefinition(brokenWorkflowDef);

if (violations.length > 0) {
  console.error(`Rejected invalid workflow! Violations found:`);
  violations.forEach(v => console.error(`- ${v.message}`));
  throw new Error('Static workflow structure checks failed.');
}
```

### 6.3 Graph Topology & Lifecycle Traversal Engine

**File Path:** `plugins/kernel/node/src/workflow/validation/topology.ts`

This validation rule applies graph theory algorithms to check the mathematical architecture of your agentic workflows. By mapping edge paths into an adjacency matrix and using a stateless **Depth-First Search (DFS)** tracker class (`TopologyTraversal`), it catches complex structural traps, infinite deadlocks, and unreachable orphan states before a workflow is compiled or executed.

#### Structural Safeguards Enforced

- **Dead-End Catching:** Flags nodes that have no outgoing connections, which would stall the state engine execution pipeline.
- **Self-Loop Detection:** Intercepts nodes that point only back to themselves, which would cause an infinite loop in a single node.
- **Orphan Isolation:** Identifies dangling sub-graphs or lone nodes that cannot be reached from the designated `entryNode`.
- **Infinite Cyclic Trap Analysis:** Flags closed execution loops that completely lack a structural exit path to the `END` terminal symbol or dynamic routing markers.

#### API Reference

##### `TopologyTraversal`

A stateful DFS execution block that runs traversal routines across the mapped graph.

| Method / Property | Signature | Description |
| --- | --- | --- |
| `constructor()` | `(outgoing: Map<string, Set<string | symbol>>, nodeNames: Set<string>)` | Sets up the lookup references. |
| `traverse()` | `(current: string) => void` | Recursively walks the graph starting from the provided node key, updating visited and stack histories. |
| `getUnreachableNodes()` | `() => string[]` | Compares the total graph node footprint against visited path footprints to extract detached nodes. |
| `hasTerminalPath` | `boolean` | Public flag indicating if at least one trajectory reaches an exit. |

##### `checkTopology`

A rule conforming to the core `ValidationRule` contract that coordinates the analysis.

```typescript
export const checkTopology: ValidationRule = (def, nodeNames, workflowId) => WorkflowValidationViolation[];
```

#### Usage Example

```typescript
import { validateWorkflowDefinition } from '@backstage/plugin-kernel-node/workflow/validation/definition';
import { z } from 'zod';

// Scenario: Defining a graph trapped in an infinite cycle loop
const cyclicWorkflow = {
  id: 'infinite-loop-playlist',
  inputSchema: z.object({}),
  state: { schema: z.object({}), stateVersion: 1 },
  artifactKinds: [],
  entryNode: 'node_a',
  nodes: {
    node_a: async () => ({}),
    node_b: async () => ({})
  },
  // Loop cycles infinitely between A and B with no connection to END
  edges: [
    { from: 'node_a', to: 'node_b' },
    { from: 'node_b', to: 'node_a' }
  ]
};

const errors = validateWorkflowDefinition(cyclicWorkflow as any);
console.log(errors[0].message);
// Output: "Workflow 'infinite-loop-playlist' is an infinite cyclic trap; n
```

### 6.5 Third-Party Workflow Validation Extensions

The Kernel backend plugin exposes an extension point named `workflowValidationExtensionPoint`. This allows external Backstage plugins or app configurations within the ecosystem to register custom structural analysis rules. These rules are combined with the core validation pipeline and run automatically before any agentic workflow compiles or executes.

#### How to Register a Custom Rule Natively

In an external Backstage module or within the app's `packages/backend/src/index.ts` setup, inject the validation registry dependency to declare custom security constraints:

```typescript
import { createBackendModule } from '@backstage/backend-plugin-api';
import { workflowValidationExtensionPoint } from '@ai-crew-suite/plugin-kernel-node';

export const customComplianceValidatorModule = createBackendModule({
  pluginId: 'kernel',
  moduleId: 'custom-workflow-rules',
  register(env) {
    env.registerInit({
      deps: {
        validationRegistry: workflowValidationExtensionPoint,
      },
      async init({ validationRegistry }) {
        // Register an operational check that rejects unapproved node profiles
        validationRegistry.registerValidator((def, nodeNames, workflowId) => {
          const errors = [];
          for (const node of nodeNames) {
            if (node.startsWith('beta_')) {
              errors.push({ 
                message: `Workflow '${workflowId}' relies on a beta node deployment flag '${node}' which is blocked by local infrastructure policies.` 
              });
            }
          }
          return errors;
        });
      },
    });
  },
});
```
