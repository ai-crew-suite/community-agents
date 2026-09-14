# Session Notes

## Prompts

I have a turbo monorepo of agentic workflow plugins for Spotify's backstage. It has a group of 18 agentic workflow plugins named in the pattern plugin-ai-agent-backend-*. Tests are in a __tests__ folder in the directory of code files.

We also have a plugins/backend/plugin-ai-core-backend and its associated plugins/backend/plugin-ai-core-node plugin. There are also plugins following a plugins/backend/plugin-ai-core-backend-module-* naming scheme that provide access to third-party platforms through a uniform interface, and to external storage and llm providers.

I'm working through improving the code quality of plugins. Implementation code should be enterprise-quality and highly robust. Unit test coverage should be robust.

#### A.1 Backstage Error Class Mapping
* **Rule:** Map custom `ErrorCode` taxonomy directly onto typed `@backstage/errors` classes at the HTTP controller boundary to ensure serialization safety and consistent standard HTTP status codes.
* **Mappings:**
  * `invalid_input` ➔ `InputError` (400)
  * Missing resource / Checkpoint missing ➔ `NotFoundError` (404)
  * Stale approval state / Race conditions ➔ `ConflictError` (409)
  * Permission rejections / RBAC blocks ➔ `NotAllowedError` (403)
* **Action:** Implement this conversion layer in an explicit mapping utility or switch statement within the controller layer.

#### A.2 Error Middleware Integrity & Sanitization

* **Rule:** Rely exclusively on the centralized Backstage `MiddlewareFactory.create({ config, logger }).error()` middleware. 
* **Action:** Never catch errors in the controller to manually return a `500` status object. Allow unhandled system exceptions to bubble directly out to the platform's error handler middleware to prevent leaking technical stack traces.

#### A.3 Secure SSE Async Error Propagation & Budgets

* **Rule:** Route runtime failures during asynchronous Server-Sent Events (SSE) connections into structured `AgentEvent` v2 `type: 'error'` messages, mapping the appropriate `ErrorCode` and a `retryable` boolean payload indicator.
* **Constraint:** Do not limit runs based on sequence numbers (`seq`). Prevent loop conditions and resource exhaustion by monitoring execution constraints (`timeoutMs`, `maxTotalTokens`, tool invocation limits) within the worker harness.

#### A.4 Observability vs. User-Facing Error Separation

* **Rule:** Separate infrastructure metrics tracking from front-end error reporting.
* **Action:** Append tracing data (`runId`, `nodeId`, `workflowId`) using the OpenTelemetry API via specific `ai.node.*` span metadata fields. Do not use the front-end `ErrorApi` as a logging sink; handle UI connection drops via regional status alert components.

#### B.1 Failure-Count Cooldowns & Local Resiliency Throttling

* **Rule:** Protect the system against cascading failures without introducing complex, stateful circuit-breaker state machines (open/half-open/closed). 
* **Action:** Implement retry classification, exponential backoff, and category-level cooldown windows directly inside `ToolExecutor` and `ModelExecutor`.
* **Configuration Execution:** Drive throttling behavior using the existing parameters in `hardening.maxRetries` and `hardening.retryBackoffMs`. Limit resource consumption by enforcing a local, failure-count-throttled cooldown window per `modelRef` or tool upon consecutive failures, bypassing external distributed state coordination.

#### B.2 SSE Reconnection & In-Flight Live Tail Recovery

* **Rule:** Ensure Server-Sent Events (SSE) connections handle dropouts mid-execution cleanly by supporting persistent stream synchronization.
* **Action:** When evaluating `Last-Event-ID` handshakes, replay every historical event stored for that run.
* **State Resumption Requirement:** If the retrieved run state registers as `running` upon completion of the historical playback loop, the controller must immediately link the client session to the active event hub and continue streaming live-tail updates seamlessly.

#### C.1 Versioned, Resumable Checkpoints
* **Rule:** Enforce append-only, idempotent checkpoints keyed by `(runId, seq)`.
* **Validation Requirement:** Every checkpoint must record an explicit `stateVersion`. The engine must reject resumption attempts when encountering a version mismatch or a corrupted state layout.

#### C.2 Field-Level Encryption & Pluggable Storage Seams

* **Rule:** Isolate encryption configurations from core orchestration engine loops. Define a clear, pluggable `StateSerializer` abstract seam on the `CheckpointStore`.
* **Decoupled Architecture:** Ensure the execution graph handles only structured `CheckpointRecord` schemas. Leave raw byte translations and field-level encryption entirely to the underlying database storage extension layer.
* **Sensitive Payload Opaque Isolation:** Only encrypt the central `payload` column (the state blob containing raw code execution evidence, prompts, and memory arrays). Keep functional, indexable metadata columns (`runId`, `seq`, `nextNode`, `stateVersion`, `createdAt`) in queryable plaintext to support platform operational routing and compliance retention purges.

#### D.1 Deterministic Fixtures & Byte-Identical Replay Validation

* **Rule:** Validate engine execution and resumption tracks using structured, scripted test fixtures rather than open-ended live dependencies.
* **Verification standard:** Use deterministic fakes (e.g., `FakeChatModel`) inside test suites to guarantee that historical event execution results match a byte-identical replay baseline before confirming state continuation paths.

#### D.2 Scoped Boundary Fault-Injection

* **Rule:** Test error resiliency boundaries at the integration layer without dragging in heavy environmental orchestration infrastructure.
* **Action:** Inject failures (such as `429 Too Many Requests`, artificial `timeoutMs` triggers, and structurally malformed payloads) directly into the `ToolExecutor` and `ModelExecutor` boundaries. Use these test conditions to explicitly verify correct engine cancellation states, resource budget tracking, and checkpoint resumption.

#### E.1 Cryptographic Identity Propagation & Non-Repudiation

* **Rule:** Enforce absolute, non-nullable identity evaluation using standard `coreServices.httpAuth`. Completely delete all hardcoded `'anonymous'` string fallbacks.
* **Non-Repudiation Requirement:** Extract a cryptographically verified `UserRef` or system-level Service Principal token from every incoming network payload to maintain robust FINRA/SOC-2 compliant non-repudiation audit trails.
* **Automation Labeling:** Explicitly assign scheduled, triggered, or event-driven automated pipeline iterations to a verified service principal designation rather than an ambiguous default status.

#### E.2 Backstage Permissions Framework Integration (RBAC)

* **Rule:** Inject the platform's `PermissionsService` and perform authorization checks directly at the controller entry boundary prior to invoking execution actions (`startRun`, `approveRun`, `streamRunEvents`).
* **Namespace Standardization:** Register AI-scoped permission assets using the plugin's structural identity prefix context (e.g., `kernel.agent.run`, `kernel.agent.approve`, `kernel.run.read`).
* **Approval Separation:** Map strict organizational checks—such as preventing developers from self-approving their own generated deployment iterations—directly to specialized permission checks at the API routing surface.

#### E.2 Modern Backstage Permissions Service Architecture

* **Rule:** Do not use the legacy `@backstage/plugin-permission-node` orchestration routers or environment blocks.
* **Modern DI Pattern:** Declare a strict dependency on `coreServices.permissions` (the `PermissionsService` interface from `@backstage/backend-plugin-api`) within the backend plugin service factory.
* **External Capability Hooking:** Leverage `permissions.authorize` with typed parameters to ensure automatic compatibility with enterprise authorization backends, such as Open Policy Agent (OPA) or custom platform role-based access control (RBAC) modules, without changing internal code.
* **Decision Signature Format:** Always parse the evaluation array safely via `AuthorizeResult` markers (e.g., `decision[0].result === AuthorizeResult.DENY`) to throw an immediate, standard `NotAllowedError`.

#### E.3 Secure SSE Stream Authorization (`streamRunEvents` IDOR Control)

* **Rule:** Eliminate Insecure Direct Object Reference (IDOR) vulnerabilities on real-time and historical playback connection lifecycles.
* **Action:** Prior to generating or connecting a Server-Sent Events (SSE) stream within the `streamRunEvents` endpoint, execute an explicit lookup of the targeted run.
* **Access Scope Mandate:** Perform an authorize check utilizing a registered read permission (e.g., `kernel.run.read`) mapped against the requesting credential token scope and verified resource identity context before returning any data.

#### F.1 Structured Logging Fields

* **Rule:** Maximize log searchability across enterprise logging aggregators (e.g., Elastic, Splunk, Datadog) by using structured payload fields.
* **Action:** Never combine tracing context identifiers into a single flat string block. Always pass operational context parameters explicitly as structured key-value metadata blocks inside native `LoggerService` methods: `this.logger.info('Node execution started', { runId, nodeId, workflowId });`

#### F.2 OpenTelemetry (OTel) Standardization & Hook Isolation

* **Rule:** Rely exclusively on standard OpenTelemetry (OTel) SDK instrumentation and distributed trace propagation to interface with Application Performance Monitoring (APM) tools.
* **Bespoke API Disallowance:** Explicitly decline and avoid custom event tracing hooks, proprietary logging callbacks, or bespoke context factory hooks (e.g., `TracingPluginHook`).
* **Enterprise Integration Strategy:** Maintain clean, decoupled framework code. Rely on standard enterprise OTel agents and open-source collectors to capture, transform, and ingest span signals natively.

#### G.1 Strict Schema Configuration & Boot-Time Connectivity Probes
* **Rule:** Enforce a strict validation schema via `config.d.ts` for all plugin options, adhering to the "fail boot, not first run" architectural principle.
* **Action:** Implement explicit, proactive lifecycle pings inside the backend initialization phase prior to accepting traffic.
* **Execution Requirements:** Execute a lightweight database connectivity check (e.g., `SELECT 1`) against the `CheckpointStore` and send a status inquiry ping to the designated LLM gateway provider. If either system verification check drops or yields a fault, block the boot lifecycle and throw an immediate, unrecoverable system exception.

#### G.2 Config-Driven Retention & Automatic Tombstone Purging

* **Rule:** Protect the underlying data layer from storage bloat and ensure compliance with enterprise data-retention mandates.
* **Action:** Provide an explicit `retention` property configuration parameter inside your schema definitions.
* **Execution Boundary:** Implement the cleanup engine as an automated background loop isolated entirely within the runtime storage module. Ensure it handles a permanent hard delete of old checkpoints, event logs, and ephemeral run artifacts once their lifespans exceed the configured retention threshold.

#### H.1 Immutable Append-Only Audit Logging

* **Rule:** Enforce absolute non-repudiation across all system operations using the pluggable `AuditLogSink`.
* **Action:** Bind a cryptographically verified, non-nullable `UserRef` or Service Principal identity string (extracted via `coreServices.httpAuth`) to every single audit ledger record.
* **Storage Seam Contract:** Enforce an immutable, append-only contract specification at the interface layer. Isolate compliance storage mechanics (such as AWS S3 Object Lock, write-once file partitions, or worm drives) within modular, external storage provider modules instead of embedding vendor-specific infrastructure logic into the core orchestration engine.

#### H.2 Irreversible Prompt Redaction & Egress Privacy Controls

* **Rule:** Prevent the leak of Protected Health Information (PHI) or Personally Identifiable Information (PII) to external, third-party model providers.
* **Action:** Apply a configurable `RedactionPolicy` (consisting of strict regex key/value identifier patterns and masking modes) directly at the `ModelExecutor` outbound pipeline boundary. 
* **Execution Boundary:** This masking check must execute *immediately before* text payloads exit the enterprise network perimeter.
* **Risk Avoidance Mandate:** Do not build reversible token vaults or re-identification storage systems. To keep the compliance framework lightweight and highly secure, enforce strict, irreversible redaction (e.g., replacement with static placeholders or hashes) before egress, eliminating the risk of data re-identification breaches.


### Backend Controller Prompt

I'd like to work through the controller code we've refactored recently and evaluate our work product block by block. I'd like to evaluate each code block on these criteria:

1. Does this code conform to Spotify Backstage conventions?
2. This code will potentially be deployed in highly regulated enterprise environments. Does this code meet strict requirements for quality and best practices?
3. Is the code well organized? Is it overly complex? What improvements would you suggest making to it?
4. Is error handling robust and appropriate in this code?
5. Are there are any issues with logging, like not logging information we should be logging? Are we using the Backstage platform logger methods?
6. Let's improve tsdoc blocks or add them if they're missing.

Then, let's generate a comprehensive unit test suite for this code block. As we go along the code blocks in a controller file, I'll paste the test suites into our test file and run them.

We have strict rules against casting to any or using any types in production code. In general, any type cast is heavily scrutinized and needs to be avoided. We prefer using generics or correctly fixing types - this is a greenfield refactor and we want to do it correctly.

## Implementing Accounting

Analysis of Current State: `plugins/kernel/node/src/types/telemetry.ts`

If `UsageMetadata` is completely unreferenced right now, its presence in your core types folder is technically a premature abstraction. However, because this is an AI orchestration platform, token accounting is foundational to achieving operational compliance.

Regulated Enterprise Context (FINRA / SOC-2 Audit Logging)

You cannot pass a strict security audit for an enterprise generative AI system if you do not track token usage metrics. Token metrics are necessary for:

- **Cost Allocation & Cost Centers:** Tracking down which departments or automated loops are spinning up enormous inference bills.
- **Data Leakage & Exfiltration Controls:** Detecting anomalies (e.g., an automated agent suddenly requesting or generating millions of unexpected tokens on a routine sweep, which often signals a data exfiltration loop or an infinite agent cycle).

## Backend Production Code Issues

### LLM and Vector Store as Stand-Alone Groups

These two plugin groups are not set up as backstage plugins, and so there is no `engine` plugin for them. I think the reason is because the vector stores are using langgraph as a direct import - and the LLM are all dependent on importing `pgvector`.

### Runtime Store is Conflating Multiple Store

`runtime-store` is handling Redis and SQL-backed stores, so pulling in unnecessary dependencies. It should be refactored to the `engine` pattern as a backstage plugin group also.

## Investigate `@ai-crew-suite/plugin-retrieval-augmenter-backend`

Why is the retrieval augment importing `@langchain/core`?

## Frontend Production Code Issues

### Finish refactor of React

We started refactoring `plugins/kernel/react` to be a common class for frontend plugins but broke off for the renaming refactor mid-way as it became clear that was necessary to avoid extra work.

### Untyped Integration Payloads (`toSuppressionWindows`)

In `correlate.ts`, `toSuppressionWindows` consumes raw output rows with a loose structural check:

```typescript
const rows = Array.isArray(records) ? records : [];
```

The method then manually loops through strings like `triggeredAt`, `startedAt`, `observedAt`, and `timestamp` to guess which field contains the timestamp.

- **The Problem:** This design bypasses type checking at your network boundaries. It assumes that downstream utility tools (Slack modules, GitHub integrations, pager modules) map their outputs to one of those four hardcoded string names.
- **The Risk:** If a downstream module upgrades its dependency framework and renames its output payload layout fields (e.g., from `startedAt` to `createdAt` or `time`), the loop will silently ignore the entire row dataset. It returns an empty list instead of failing explicitly, which blinds your automated tuning graphs to real ongoing production incident signals.
- **The Fix:** Instead of passing an unverified array down-funnel, use strict Zod validation schemas right at the output boundary of your tool modules (the Slack and GitHub wrappers) to normalize payloads into a standard type before they reach the workflow layer.

### Direct, Unguarded Network Calls in Schedulers

In `weeklySweep.ts`, the background task fires native `fetch` requests inside a loop directly to the engine's REST paths:

```typescript
const response = await fetch(`${base}/agents/${ALERT_AI_TUNER_AGENT_ID}/runs`, { ... });
```

- **The Problem:** This completely bypasses the Backstage plugin communication layers, requiring manual management of headers, authorization tokens, content types, and error states.
- **The Risk:** If the core engine URL shifts slightly due to sub-route base mapping flags, or if the payload wrapper structures mutate during a framework upgrade, the scheduler will fail silently, logging basic warnings rather than leveraging a centralized API bridge client interface.
- **The Fix:** Abstract this communication layer. The scheduler should use the centralized **`AiAgentClientFactory`** we designed to trigger runs typesafely over an explicit interface hook rather than manually executing raw `fetch` string concatenations.

### Silent Degradation via `try/catch` Swallowing

In `TunerToolRunner.ts`, the `invoke` method wraps its execution block in a generic catch-all trap:

```typescript
} catch (error) {
  // ... logs warning and returns undefined
  return undefined;
}
```

- **The Problem:** While fault isolation is good, treating *all* errors identically obscures critical runtime infrastructure problems.
- **The Risk:** If a network call fails due to a temporary network blip, returning `undefined` is appropriate. However, if it fails due to a **database connection failure**, an **expired authorization token**, or an **out-of-memory fatal crash**, swallowing the exception and returning `undefined` misleads the orchestration engine into thinking the tool completed with "empty data," rather than failing due to platform issues.
- **The Fix:** Differentiate your errors. Catch and handle transient operational errors safely, but explicitly re-throw system-level anomalies (such as authentication failures or memory exhaustion tokens) to allow the orchestration runtime to halt the execution immediately.



