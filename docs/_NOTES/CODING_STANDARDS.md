# Coding Standards

## Section A — Error Handling / Express Middleware

### A.1 Backstage Error Class Mapping

* **Rule:** Map custom `ErrorCode` taxonomy directly onto typed `@backstage/errors` classes at the HTTP controller boundary to ensure serialization safety and consistent standard HTTP status codes.
* **Mappings:**
  * `invalid_input` ➔ `InputError` (400)
  * Missing resource / Checkpoint missing ➔ `NotFoundError` (404)
  * Stale approval state / Race conditions ➔ `ConflictError` (409)
  * Permission rejections / RBAC blocks ➔ `NotAllowedError` (403)
* **Action:** Implement this conversion layer in an explicit mapping utility or switch statement within the controller layer.

### A.2 Error Middleware Integrity & Sanitization

* **Rule:** Rely exclusively on the centralized Backstage `MiddlewareFactory.create({ config, logger }).error()` middleware. 
* **Action:** Never catch errors in the controller to manually return a `500` status object. Allow unhandled system exceptions to bubble directly out to the platform's error handler middleware to prevent leaking technical stack traces.

### A.3 Secure SSE Async Error Propagation & Budgets

* **Rule:** Route runtime failures during asynchronous Server-Sent Events (SSE) connections into structured `AgentEvent` v2 `type: 'error'` messages, mapping the appropriate `ErrorCode` and a `retryable` boolean payload indicator.
* **Constraint:** Do not limit runs based on sequence numbers (`seq`). Prevent loop conditions and resource exhaustion by monitoring execution constraints (`timeoutMs`, `maxTotalTokens`, tool invocation limits) within the worker harness.

### A.4 Observability vs. User-Facing Error Separation

* **Rule:** Separate infrastructure metrics tracking from front-end error reporting.
* **Action:** Append tracing data (`runId`, `nodeId`, `workflowId`) using the OpenTelemetry API via specific `ai.node.*` span metadata fields. Do not use the front-end `ErrorApi` as a logging sink; handle UI connection drops via regional status alert components.

## Section B — Circuit Breakers / Resilience

### B.1 Failure-Count Cooldowns & Local Resiliency Throttling

* **Rule:** Protect the system against cascading failures without introducing complex, stateful circuit-breaker state machines (open/half-open/closed). 
* **Action:** Implement retry classification, exponential backoff, and category-level cooldown windows directly inside `ToolExecutor` and `ModelExecutor`.
* **Configuration Execution:** Drive throttling behavior using the existing parameters in `hardening.maxRetries` and `hardening.retryBackoffMs`. Limit resource consumption by enforcing a local, failure-count-throttled cooldown window per `modelRef` or tool upon consecutive failures, bypassing external distributed state coordination.

### B.2 SSE Reconnection & In-Flight Live Tail Recovery

* **Rule:** Ensure Server-Sent Events (SSE) connections handle dropouts mid-execution cleanly by supporting persistent stream synchronization.
* **Action:** When evaluating `Last-Event-ID` handshakes, replay every historical event stored for that run.
* **State Resumption Requirement:** If the retrieved run state registers as `running` upon completion of the historical playback loop, the controller must immediately link the client session to the active event hub and continue streaming live-tail updates seamlessly.

## Section C — Checkpointing / State Integrity

### C.1 Versioned, Resumable Checkpoints

* **Rule:** Enforce append-only, idempotent checkpoints keyed by `(runId, seq)`.
* **Validation Requirement:** Every checkpoint must record an explicit `stateVersion`. The engine must reject resumption attempts when encountering a version mismatch or a corrupted state layout.

### C.2 Field-Level Encryption & Pluggable Storage Seams

* **Rule:** Isolate encryption configurations from core orchestration engine loops. Define a clear, pluggable `StateSerializer` abstract seam on the `CheckpointStore`.
* **Decoupled Architecture:** Ensure the execution graph handles only structured `CheckpointRecord` schemas. Leave raw byte translations and field-level encryption entirely to the underlying database storage extension layer.
* **Sensitive Payload Opaque Isolation:** Only encrypt the central `payload` column (the state blob containing raw code execution evidence, prompts, and memory arrays). Keep functional, indexable metadata columns (`runId`, `seq`, `nextNode`, `stateVersion`, `createdAt`) in queryable plaintext to support platform operational routing and compliance retention purges.

## Section D — Testing

### D.1 Deterministic Fixtures & Byte-Identical Replay Validation

* **Rule:** Validate engine execution and resumption tracks using structured, scripted test fixtures rather than open-ended live dependencies.
* **Verification standard:** Use deterministic fakes (e.g., `FakeChatModel`) inside test suites to guarantee that historical event execution results match a byte-identical replay baseline before confirming state continuation paths.

### D.2 Scoped Boundary Fault-Injection

* **Rule:** Test error resiliency boundaries at the integration layer without dragging in heavy environmental orchestration infrastructure.
* **Action:** Inject failures (such as `429 Too Many Requests`, artificial `timeoutMs` triggers, and structurally malformed payloads) directly into the `ToolExecutor` and `ModelExecutor` boundaries. Use these test conditions to explicitly verify correct engine cancellation states, resource budget tracking, and checkpoint resumption.

## Section E — AuthN/AuthZ / RBAC

### E.1 Cryptographic Identity Propagation & Non-Repudiation

* **Rule:** Enforce absolute, non-nullable identity evaluation using standard `coreServices.httpAuth`. Completely delete all hardcoded `'anonymous'` string fallbacks.
* **Non-Repudiation Requirement:** Extract a cryptographically verified `UserRef` or system-level Service Principal token from every incoming network payload to maintain robust FINRA/SOC-2 compliant non-repudiation audit trails.
* **Automation Labeling:** Explicitly assign scheduled, triggered, or event-driven automated pipeline iterations to a verified service principal designation rather than an ambiguous default status.

### E.2 Backstage Permissions Framework Integration (RBAC)

* **Rule:** Inject the platform's `PermissionsService` and perform authorization checks directly at the controller entry boundary prior to invoking execution actions (`startRun`, `approveRun`, `streamRunEvents`).
* **Namespace Standardization:** Register AI-scoped permission assets using the plugin's structural identity prefix context (e.g., `kernel.agent.run`, `kernel.agent.approve`, `kernel.run.read`).
* **Approval Separation:** Map strict organizational checks—such as preventing developers from self-approving their own generated deployment iterations—directly to specialized permission checks at the API routing surface.

### E.2 Modern Backstage Permissions Service Architecture

* **Rule:** Do not use the legacy `@backstage/plugin-permission-node` orchestration routers or environment blocks.
* **Modern DI Pattern:** Declare a strict dependency on `coreServices.permissions` (the `PermissionsService` interface from `@backstage/backend-plugin-api`) within the backend plugin service factory.
* **External Capability Hooking:** Leverage `permissions.authorize` with typed parameters to ensure automatic compatibility with enterprise authorization backends, such as Open Policy Agent (OPA) or custom platform role-based access control (RBAC) modules, without changing internal code.
* **Decision Signature Format:** Always parse the evaluation array safely via `AuthorizeResult` markers (e.g., `decision[0].result === AuthorizeResult.DENY`) to throw an immediate, standard `NotAllowedError`.

### E.3 Secure SSE Stream Authorization (`streamRunEvents` IDOR Control)

* **Rule:** Eliminate Insecure Direct Object Reference (IDOR) vulnerabilities on real-time and historical playback connection lifecycles.
* **Action:** Prior to generating or connecting a Server-Sent Events (SSE) stream within the `streamRunEvents` endpoint, execute an explicit lookup of the targeted run.
* **Access Scope Mandate:** Perform an authorize check utilizing a registered read permission (e.g., `kernel.run.read`) mapped against the requesting credential token scope and verified resource identity context before returning any data.

## Section F — Observability / APM extensibility

### F.1 Structured Logging Fields

* **Rule:** Maximize log searchability across enterprise logging aggregators (e.g., Elastic, Splunk, Datadog) by using structured payload fields.
* **Action:** Never combine tracing context identifiers into a single flat string block. Always pass operational context parameters explicitly as structured key-value metadata blocks inside native `LoggerService` methods: `this.logger.info('Node execution started', { runId, nodeId, workflowId });`

### F.2 OpenTelemetry (OTel) Standardization & Hook Isolation

* **Rule:** Rely exclusively on standard OpenTelemetry (OTel) SDK instrumentation and distributed trace propagation to interface with Application Performance Monitoring (APM) tools.
* **Bespoke API Disallowance:** Explicitly decline and avoid custom event tracing hooks, proprietary logging callbacks, or bespoke context factory hooks (e.g., `TracingPluginHook`).
* **Enterprise Integration Strategy:** Maintain clean, decoupled framework code. Rely on standard enterprise OTel agents and open-source collectors to capture, transform, and ingest span signals natively.

## Section G — Config / Ops Standards

### G.1 Strict Schema Configuration & Boot-Time Connectivity Probes

* **Rule:** Enforce a strict validation schema via `config.d.ts` for all plugin options, adhering to the "fail boot, not first run" architectural principle.
* **Action:** Implement explicit, proactive lifecycle pings inside the backend initialization phase prior to accepting traffic.
* **Execution Requirements:** Execute a lightweight database connectivity check (e.g., `SELECT 1`) against the `CheckpointStore` and send a status inquiry ping to the designated LLM gateway provider. If either system verification check drops or yields a fault, block the boot lifecycle and throw an immediate, unrecoverable system exception.

### G.2 Config-Driven Retention & Automatic Tombstone Purging

* **Rule:** Protect the underlying data layer from storage bloat and ensure compliance with enterprise data-retention mandates.
* **Action:** Provide an explicit `retention` property configuration parameter inside your schema definitions.
* **Execution Boundary:** Implement the cleanup engine as an automated background loop isolated entirely within the runtime storage module. Ensure it handles a permanent hard delete of old checkpoints, event logs, and ephemeral run artifacts once their lifespans exceed the configured retention threshold.

## Section H — Compliance items (SOC-2 / HIPAA / FINRA)

### H.1 Immutable Append-Only Audit Logging

* **Rule:** Enforce absolute non-repudiation across all system operations using the pluggable `AuditLogSink`.
* **Action:** Bind a cryptographically verified, non-nullable `UserRef` or Service Principal identity string (extracted via `coreServices.httpAuth`) to every single audit ledger record.
* **Storage Seam Contract:** Enforce an immutable, append-only contract specification at the interface layer. Isolate compliance storage mechanics (such as AWS S3 Object Lock, write-once file partitions, or worm drives) within modular, external storage provider modules instead of embedding vendor-specific infrastructure logic into the core orchestration engine.

### H.2 Irreversible Prompt Redaction & Egress Privacy Controls

* **Rule:** Prevent the leak of Protected Health Information (PHI) or Personally Identifiable Information (PII) to external, third-party model providers.
* **Action:** Apply a configurable `RedactionPolicy` (consisting of strict regex key/value identifier patterns and masking modes) directly at the `ModelExecutor` outbound pipeline boundary. 
* **Execution Boundary:** This masking check must execute *immediately before* text payloads exit the enterprise network perimeter.
* **Risk Avoidance Mandate:** Do not build reversible token vaults or re-identification storage systems. To keep the compliance framework lightweight and highly secure, enforce strict, irreversible redaction (e.g., replacement with static placeholders or hashes) before egress, eliminating the risk of data re-identification breaches.


