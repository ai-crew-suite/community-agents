# AI Crew Suite `kernel/backend` Architecture

```bash
├── src
│   ├── api
│   │   ├── controller
│   │   │   ├── context.ts
│   │   │   ├── embedding.ts
│   │   │   ├── identity.ts
│   │   │   ├── index.ts
│   │   │   ├── run.ts
│   │   │   ├── schemas.ts
│   │   │   ├── __tests__
│   │   │   │   ├── context.test.ts
│   │   │   │   ├── embedding.test.ts
│   │   │   │   ├── identity.test.ts
│   │   │   │   ├── index.test.ts
│   │   │   │   ├── run.test.ts
│   │   │   │   ├── schemas.test.ts
│   │   │   │   ├── trigger.test.ts
│   │   │   │   └── webhook.test.ts
│   │   │   ├── trigger.ts
│   │   │   ├── types.ts
│   │   │   └── webhook.ts
│   │   ├── permissions.ts
│   │   └── router
│   │       ├── index.ts
│   │       ├── __tests__
│   │       │   └── index.test.ts
│   │       └── types.ts
│   ├── index.ts
│   ├── plugin.ts
│   ├── registry
│   │   ├── __tests__
│   │   │   └── ToolRegistry.test.ts
│   │   └── ToolRegistry.ts
│   ├── runtime
│   │   ├── AgentRuntime.ts
│   │   ├── EventMapper.ts
│   │   ├── GraphExecutor.ts
│   │   ├── index.ts
│   │   ├── LangGraphCheckpointer.ts
│   │   ├── ModelExecutor.ts
│   │   ├── NodeHarness.ts
│   │   ├── Redactor.ts
│   │   ├── __tests__
│   │   └── ToolExecutor.ts
│   ├── service
│   │   ├── factory.ts
│   │   ├── index.ts
│   │   ├── __tests__
│   │   │   └── factory.test.ts
│   │   └── types.ts
│   ├── __tests__
│   │   ├── configSchemaSync.test-d.ts
│   │   └── plugin.test.ts
│   ├── testUtils
│   │   └── index.ts
│   ├── tools
│   │   ├── index.ts
│   │   ├── prompts.ts
│   │   ├── __tests__
│   │   │   └── prompts.test.ts
│   │   └── ToolPacks.ts
│   └── types
│       └── index.ts
```

## After Refactor

```bash
plugins/kernel/backend/
├── src/
│   ├── api/
│   │   ├── commands/                        # NEW: Pure Domain Execution Core (CQRS)
│   │   │   ├── types.ts                     # Invariant command contexts & packed input schemas
│   │   │   ├── BaseKernelCommand.ts         # Template Method base skeleton class (zero-any)
│   │   │   ├── StartRunCommand.ts           # Concrete agent run command handler
│   │   │   ├── ApproveRunCommand.ts         # Concrete compliance decision handler
│   │   │   ├── StreamRunEventsCommand.ts    # Concrete real-time SSE stream handler
│   │   │   ├── CreateEmbeddingsCommand.ts   # Concrete vector boundary ingest handler
│   │   │   ├── DeleteEmbeddingsCommand.ts   # Concrete vector boundary deletion handler
│   │   │   └── GetEmbeddingsCommand.ts      # Concrete vector boundary query handler
│   │   ├── permissions.ts                   # Strict namespace RBAC definitions (aiPermissions)
│   │   └── router/
│   │       ├── index.ts                     # Declarative, highly-readable endpoint routing topology
│   │       ├── adaptCommand.ts              # Higher-Order security perimeter adapter engine
│   │       ├── types.ts                     # Router types
│   │       └── __tests__/
│   │           ├── index.test.ts            # Integration endpoint specifications
│   │           └── adaptCommand.test.ts     # Boundary token parsing validations
│   ├── index.ts                             # Package entry point
│   ├── plugin.ts                            # New Backstage Backend lifecycle & extension hooks
│   ├── registry/
│   │   └── ToolRegistry.ts                  # Startup tool composition store
│   ├── runtime/                             # Isolated Core Processing & Orchestration Engine
│   │   ├── AgentRuntime.ts                  # Workflow runner manager
│   │   ├── EventMapper.ts                   # LangGraph stream converter pipeline
│   │   ├── GraphExecutor.ts                 # Idempotent node graph compiler
│   │   ├── LangGraphCheckpointer.ts         # Thread checkpoint persistence provider
│   │   ├── ModelExecutor.ts                 # Mandatory outbound model egress boundary (PHI/PII Redaction)
│   │   ├── NodeHarness.ts                   # Per-node safety wrapper (OTel metrics & budgets)
│   │   ├── Redactor.ts                      # Irreversible text masking engine (SOC-2/HIPAA floor)
│   │   ├── ToolExecutor.ts                  # Choke point for tool capabilities evaluation
│   │   └── __tests__/                       # Deterministic fakes & fault-injection suites
│   ├── service/
│   │   ├── factory.ts                       # Boot-time dependency graphing & registry validation
│   │   ├── types.ts                         # Service configuration bindings
│   │   └── index.ts                         # Module exports boundary
│   ├── testUtils/                           # Scripted test fakes & byte-identical replay tools
│   ├── tools/                               # Default runtime utility packs
│   └── types/
│       └── index.ts                         # System wide core runtime typings
├── config.d.ts                              # REQUIRED: Strict boot-time validation schema profiles
└── package.json
```

## `plugins/kernel/backend/src/runtime/AgentRuntime.ts`

Lifecycle-only runtime for AI Core. Resolves agents to workflow definitions, creates run records, owns the retry loop, and pipes GraphExecutor events through persistence (run steps, artifacts, audit, usage). Sequencing and orchestration mechanics live in GraphExecutor.

Implemented as the class `AgentRuntime`. Methods:

- `*run`: Executes a new run and streams normalized agent events to callers.
- `*resume`: Resumes a paused run after an approval decision.
- `createRunRecord`:
- `cancelIfAborted`:
- `processRunEvent`:
- `failRun`:
- `sleep`:

Imported by `service/factory.ts`.

## `plugins/kernel/backend/src/runtime/GraphExecutor.ts`

The single execution engine for AI Core. Compiles WorkflowDefinitions into executable graphs once per workflow; validates definitions at boot; runs sequences of nodes with checkpointing on the LangGraph checkpointer.

Implemented as the class `GraphExecutor`. Methods:

- `resolveDefinition`: Resolve a workflow definition by ID. Throws at boot if unknown.
- `*run`: Run agents/workflows to produce AgentEvent stream.

 Type is imported by `runtime/AgentRuntime.ts`.

## `plugins/kernel/backend/src/runtime/ModelExecutor.ts`

The only path to models from within a workflow node. Resolves `modelRef` or a tier name to a `BaseChatModel`, streams tokens as events, enforces token budgets, runs guardrail classification, and supports tool-calling dispatch.

Implemented as the class `ModelExecutor`. Methods:

- `resolveModel`: Resolve the agent's model. Throws at boot-time if unknown tier/ref.
- `forTier`: Returns an executor bound to a named tier e.g. "Thinking Level" tiers like `high`.
- `*stream`: Stream a chat model over message arrays. Token chunks are emitted via the eventMapper as `token` events with the originating node name; usage accumulates. Pre-egress redaction is applied here (HIPAA/PHI layer).
- `invoke`: Invoke (non-streaming) convenience helper.

Type is imported by `runtime/AgentRuntime.ts` and `runtime/GraphExecutor.ts`.

## `plugins/kernel/backend/src/runtime/ToolExecutor.ts`

Core-owned single choke point for all tool invocation. Enforces allow-lists, provider policy, RBAC provider filter, effect gating, budgets, and audit.

Implemented as the class `ToolExecutor`. Methods:

- `invoke`: Dispatch a tool invocation. Returns the result after all checks pass. Throws NodeError('tool_denied') on allow-list/provider/RBAC/effect violations.

Type is imported by `runtime/AgentRuntime.ts` and `runtime/GraphExecutor.ts`.

## `plugins/kernel/backend/src/runtime/EventMapper.ts`

Single owner of LangGraph stream -> AgentEvent v2 translation. Converts node enter/exit updates, message tokens, custom events, tool dispatches, usage metadata, and errors into the typed union. One bug-fix point for all.

Implemented as the class `EventMapper`. Methods:

- `step`: Emit an ordered step event for node enter/exit.
- `token`: Emit a node-attributed token event
- `toolCall`: Emit node-attributed tool call/result events.
- `toolResult`:
- `usage`: Emit a usage event (node-attributed when available).
- `artifact`: Emit an artifact event.
- `approvalRequest`: Emit an approval request event.
- `done`: Emit a done event.
- `error`: Emit an error event with structural classification.

Imported by `runtime/ModelExecutor.ts`. Type is imported by `runtime/GraphExecutor.ts`.

## `plugins/kernel/backend/src/runtime/LangGraphCheckpointer.ts`

Adapter from the AI Core `CheckpointStore` contract to LangGraph's `BaseCheckpointSaver` interface. `thread_id = runId`; `put` is idempotent on (runId, seq) so engine retries cannot double-write.

Implemented as the class `LangGraphCheckpointer`. Methods:

- `get`: Load the latest checkpoint for a thread.
- `getTuple`:
- `put`: Persist a checkpoint at the current graph position.
- `list`: Full ordered history for replay/debug.
- `deleteThread`: Tombstone a run's checkpoints.

Type is imported by `runtime/GraphExecutor.ts`.

## `plugins/kernel/backend/src/runtime/NodeHarness.ts`

Per-node safety wrapper applied to every plugin node function before it's added to the graph. Enforces state validation, budget accounting, redaction, structured error classification, OTel spans, and structured logs.

Implemented as the class `NodeHarness`. Methods:

- `wrap`: Wrap a node function with the harness.

Imported by `runtime/GraphExecutor.ts`

## `plugins/kernel/backend/src/runtime/Redactor.ts`

Engine for the configurable redaction policy. Replaces the hardcoded SENSITIVE_KEYS redactor from the old AgentRuntime. Operators may append patterns via `ai.redaction.*` config but cannot weaken the built-in floor.

Implemented as the class `Redactor`. Methods:

- `apply`: Redact sensitive keys/values in an arbitrary payload.

Imported by `runtime/GraphExecutor.ts`

## 📈 Runtime Blueprint Assessment

Your architectural topology can be visualized as three clean, isolated rings:

![Alternative text](docs/layers-graph.jpg)

Because your runtime ring is already decoupled from HTTP infrastructure, migrating the upper layers to the **Template Method Command Pattern** provides immediate security and compliance safeguards without destabilizing your existing LangGraph orchestration logic.

### Runtime Refactor

The runtime directory functions as a pure, decoupled domain engine. It remains blissfully unaware of the Express edge layer or specific HTTP request structures. This clean separation of concerns is the primary reason it will survive a CQRS transition without needing a massive rewrite.

However, when evaluating this layout against strict **FINRA, HIPAA, and SOC-2 enterprise compliance standards**, three architectural vulnerabilities and optimization vectors stand out within these runtime files:

#### 1. The `null as never` LangGraph Pipeline Leak

- **The Assessment:** In `factory.ts`, `GraphExecutor` is instantiated with seven consecutive `null as never` arguments. This reveals a hidden structural dependency leak. If `GraphExecutor` relies on positional constructor parameters that the factory cannot provide at boot time, it means infrastructure properties (like individual run contexts or specific request sinks) are trying to cross into a stateless graph compiler.
- **The Refactor Recommendation:** `GraphExecutor` should be a stateless compiler focused on compiling `WorkflowDefinitions` into graphs once per workflow. Per-run dependencies (like `runId`, `sessionStore`, or `artifactSink`) should be passed dynamically as execution context *at the moment of invocation* inside the `*run` generator method, completely removing `null as never` from the boot phase.

#### 2. Double-Redaction Operational Inefficiency

- **The Assessment:** The architecture currently lists two separate redaction checkpoints:
  1. `ModelExecutor.*stream` applies a pre-egress redaction layer (HIPAA/PHI compliance).
  2. `NodeHarness.wrap` applies state validation and redaction before data hits the graph state.
- **The Assessment:** While double-checking is safe, redundant parsing operations over large token contexts add processing latency. More importantly, if `NodeHarness` sanitizes the graph state, but `ModelExecutor` also has to redact its outbound text streams, it indicates that untrusted, un-redacted tools or external platform variables are entering the graph payload downstream.
- **The Refactor Recommendation:** Consolidate the `Redactor` interface. Establish a single, deterministic **Egress Compliance Boundary** inside `ModelExecutor` immediately before outbound serialization to third-party APIs. Keep the `NodeHarness` focused strictly on telemetry metrics collection and execution resource accounting.

#### 3. The `AgentRuntime.ts` Single Point of Failure (SPOF)

- **The Assessment:** `AgentRuntime` owns the execution loop, event routing, record persistence, retry policies, and error handling. For an enterprise framework, this class is managing too many cross-cutting concerns simultaneously. In a production cluster running thousands of concurrent developer pipelines, this procedural sequencing loop risks stalling engine threads if database writes hit a performance bottleneck.
- **The Refactor Recommendation:** Make the event streaming path fully asynchronous by leveraging `EventMapper` as a pure, functional data transformer. Ensure `AgentRuntime` offloads state tracking directly to the append-only `LangGraphCheckpointer` so that single worker threads can handle rapid pipeline interruptions or crash recovery without state loss.

## `plugins/kernel/backend/src/registry/ToolRegistry.ts`

> **CURRENTLY UNUSED**

Simple in-memory implementation of the tool registry extension point. Intended for local/backend runtime composition where tool definitions are registered during startup and queried during run execution.

Implemented as the class `InMemoryToolRegistry`. Methods:

- `register`: Registers or replaces a tool by id.
- `get`: Looks up a single tool by id.
- `put`: Persist a checkpoint at the current graph position.
- `list`: Returns all registered tools in insertion order.

## `plugins/kernel/backend/src/tools/ToolPacks.ts`

> **CURRENTLY UNUSED**

Creates built-in demo tool packs for common integration domains. These tools are intentionally lightweight placeholders that provide stable behavior and logging hooks until provider-specific implementations are wired.

Implemented as the function `createDefaultToolPackTools`.

## `plugins/kernel/backend/src/tools/prompts.ts`

> **CURRENTLY UNUSED**

Three functions:

- `prefixPrompt`: Creates the system-prefix prompt formatter used before the user question. When a custom prefix is configured, that text is prepended directly to the retrieved embedding context. Otherwise, a safe default instruction is used to constrain the model to grounded, document-based answers.
- `suffixPrompt`: Creates the user-question suffix formatter appended after context assembly. This keeps the final prompt shape consistent while allowing an optional custom suffix to override the default "Begin / Question" framing.
- `createPromptTemplates`: Builds the prompt template functions used by the RAG pipeline. The returned helpers encapsulate configured overrides and fallback defaults, so callers can compose final prompts without repeating prompt policy logic.
