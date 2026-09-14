# Enterprise/Compliance Audit — Agent Assessment

Assessment of the items in the enterprise-ready audit check list, grounded in the actual codebase. Verdicts: **ADOPT** (plan-worthy, right-sized), **ADAPT** (right goal, wrong mechanism — do it differently), **DEFER** (real but not worth it now), **DECLINE** (not applicable / not worth it / impossible as stated).

## User Updates

1. I made changes under "User Notes" in the "E.2 RBAC via Backstage Permissions framework" section. We want to use the Modern contract only and `@backstage/backend-plugin-api`.
2. I modified "C.2 Field-level checkpoint encryption" to include the seam we discussed, and added our notes to the item.
3. I removed the "DECLINE" items from our list, except for the note in F.2 about declining custom hooks.

---

## Section A — Error Handling / Express Middleware

### A.1 Typed `@backstage/errors` classes — ADOPT

Correct and already partially true (`InputError` is used). Map the `ErrorCode` taxonomy (§4.3.3) onto Backstage error classes at the HTTP boundary: `invalid_input`→`InputError`, missing run/checkpoint→`NotFoundError`, stale approval→`ConflictError`, permission denial→`NotAllowedError`. This is the single source of HTTP status association and serialization safety. Cheap since `ErrorCode` already exists — the mapping belongs in the controller layer, one switch.

### A.2 Centralized `MiddlewareFactory` error middleware — ADOPT (already present)

`router.ts` already wires `MiddlewareFactory.create({config,logger}).error()`. The ask is to *ensure* it stays and nothing bypasses it. No new work; add a test that an unhandled controller throw returns a sanitized 500 without stack leakage.

### A.3 SSE async error propagation — ADOPT, with one correction

Correct that post-trigger errors serialize into `AgentEvent` v2 `type: 'error'` — exactly the `ErrorCode`/`retryable` design in the plan. **Correction:** the audit's "sequence numbers (`seq`) exceed safety caps" is the wrong budget signal. `seq` is just an event counter; runaway-cost prevention is the *token/tool/wall-clock* budgets in the node harness (§5.2), not a seq ceiling. Implement budget aborts on tokens/invocations/duration; do not invent a seq cap.

### A.4 OTel + `ErrorApi` integration — ADAPT

Backend OTel tracing with `runId`/`node`/`workflowId` span attributes: **adopt**, already in plan (§8 observability, `ai.node.*` spans). **Adapt** the frontend part: `ErrorApi` surfaces user-facing errors in the app shell; it is *not* a telemetry sink and should not be wired as one. Frontend SSE failures surface through the plugin's own status banner + the persisted error event. Keep the two concerns separate.

---

## Section B — Circuit Breakers / Resilience

### B.1 Breaker around external LLM/tool calls — ADAPT

Goal (stop hammering a failing dependency) is right; a bespoke breaker in the node harness is the wrong mechanism. Adapt to: per-tool and per-model **retry classification + exponential backoff + per-category cooldown window in `ToolExecutor`/`ModelExecutor`**, backed by existing `hardening.maxRetries`/`retryBackoffMs` config. A full circuit-breaker state machine (open/half-open/closed with probe traffic) is real complexity; for a single-process plugin, a failure-count-throttled cooldown per modelRef/tool gives most of the value at a fraction of the cost. Decline distributed breaker coordination (infra concern).

### B.2 SSE reconnection / resync — ADOPT (partially exists)

`streamRunEvents` + `Last-Event-ID` replay already exists. The gap: it replays *persisted* steps then ends — no live-tail for an in-flight run after reconnect. Adopt: after replaying steps, if run status is `running`, continue streaming live. A real correctness gap for long-running graphs; fix in the engine pass.

## Section C — Checkpointing / State Integrity

### C.1 Versioned, resumable checkpoints — ADOPT (core of the plan)

§4.4 already specifies versioned, append-only, idempotent `(runId, seq)` checkpoints with `stateVersion` and refusal to resume mismatched versions. Fully aligned; this is the plan's centerpiece.

### C.2 Field-level checkpoint encryption (KMS/Vault) — ADOPT the seam, DEFER the reference KMS implementation

Encryption at rest is the **storage module's** concern (`plugin-ai-core-backend-module-runtime-store`), not the engine's. Right move: define a pluggable `StateSerializer`/`EncryptionProvider` seam on `CheckpointStore` so an enterprise can supply KMS/Vault envelope encryption, ship an unencrypted default, and document the requirement. Do not build KMS integration into core — provider-specific, belongs behind the seam. Provide the *seam*, not the *implementation*.

## The seam: a serializer on the `CheckpointStore` write path

The cleanest place to cut is *between* "the checkpoint as a typed object" and "the bytes that hit the database." That boundary is one interface:

```ts
// plugin-ai-core-node/src/@types/checkpoint.ts

/**
 * Transforms a checkpoint record to/from its persisted
 * representation. The default is pass-through JSON; an
 * enterprise supplies an encrypting implementation. The
 * engine and CheckpointStore logic are unaware of it.
 */
export interface StateSerializer {
  /**
   * Stable identifier, recorded on each row so mixed
   * plaintext/encrypted stores can be read back and
   * migrated.
   */
  readonly serializerId: string;
  /**
   * Called once per checkpoint before persistence. Must be
   * deterministic enough that the same record decrypts
   * identically.
   */
  serialize(record: CheckpointRecord): Promise<PersistedCheckpoint>;
  /** Inverse of serialize; called on every read. */
  deserialize(record: PersistedCheckpoint): Promise<CheckpointRecord>;
}

export type PersistedCheckpoint = {
  runId: string;
  seq: number;
  /**
   * Opaque payload — ciphertext when encrypted, JSON when
   * not.
   */
  payload: Uint8Array | string;
  /**
   * Which serializer produced this row; drives
   * deserialize().
   */
  serializerId: string;
  /**
   * Non-sensitive metadata kept queryable in plaintext
   * (never the state blob).
   */
  nextNode?: string;
  stateVersion: number;
  createdAt: string;
};
```

The crucial detail: __only the `state` blob gets encrypted.__ The routing metadata (`runId`, `seq`, `nextNode`, `stateVersion`, `createdAt`) stays in plaintext columns, because the engine needs `nextNode` to resume and ops needs `createdAt` for retention purges — and none of those are sensitive. The sensitive thing (the full workflow state: evidence, prompts, intermediate outputs) is the opaque `payload`. This is what "field-level" means in practice: encrypt the sensitive column, keep the operational columns readable.

## How it plugs in — extension point, same pattern as everything else

One new method on the existing `runtimeStoreExtensionPoint` (or a small dedicated one):

```ts
export interface RuntimeStoreExtensionPoint {
  setSessionStore(store: SessionStore): void;
  setCheckpointStore(store: CheckpointStore): void;
  setRunStore(store: RunStore): void;
  setArtifactSink(sink: ArtifactSink): void;
  setAuditLogSink(sink: AuditLogSink): void;
  /**
   * NEW: optional. Default is JsonStateSerializer (no
   * encryption).
   */
  setStateSerializer?(serializer: StateSerializer): void;
}
```

The runtime-store module composes it: `SqlCheckpointStore` writes whatever `serializer.serialize()` returns and reads via `deserialize()`. If no serializer is registered, it uses the built-in JSON pass-through. The engine, `GraphExecutor`, and `LangGraphCheckpointer` are completely untouched — they hand a `CheckpointRecord` down and get one back.

## Section D — Testing

### D.1 Deterministic fixture / fake model layer — ADOPT

Already the plan (§9, `FakeChatModel` + scripted fixtures + `runWorkflow` harness). The audit's emphasis on byte-identical replay is exactly the plan's determinism acceptance criterion.

### D.2 Chaos/fault-injection across tool boundaries — ADOPT, scoped

Fault-inject at the `ToolExecutor`/`ModelExecutor` boundary (timeouts, 429s, malformed payloads) in the engine suite — high value, proves cancellation/resume/budget behavior. Scope to the engine + one pilot workflow. Decline full-blown chaos infrastructure (process kills, network partitions) — disproportionate for a plugin library; that's the operator's environment.

---

## Section E — AuthN/AuthZ / RBAC (the largest genuine gap)

### E.1 Real identity propagation — ADOPT, blocking correctness bug

**Today identity is hardcoded `'anonymous'`** (`controller.ts:324`, `controller.ts:517`) and there is no `HttpAuthService` wiring anywhere in the core plugin. This is not a nice-to-have — the entire audit/approval story (FINRA/SOC-2 non-repudiation) collapses without a cryptographically verified `UserRef`. Adopt: wire `coreServices.httpAuth` into the router/controller, extract the verified `UserRef` from the request token, make `identity` strict and non-nullable through `RunContext`, and delete every `'anonymous'` fallback. Scheduled/trigger runs use the service principal, explicitly labeled as such (not "anonymous").

### E.2 RBAC via Backstage Permissions framework — ADOPT

Zero permissions integration today. Adopt: register AI-specific permissions (e.g. `ai.agent.run`, `ai.agent.approve`, `ai.run.read`) with `@backstage/plugin-permission-node`, evaluate them in the controller before `startRun`/`approveRun`/`streamRunEvents`. The `ApprovalAuthorizer` seam (§6.3) becomes the permission-backed implementation. Directly answers the guardrail-agent "developer cannot self-approve" requirement.

#### 1. Do the legacy and modern permissions systems have different contracts?

**Yes.** They represent a completely different architectural paradigm in how services are wired up and how dependency injection works.

- **`@backstage/plugin-permission-node` (Legacy Contract):** Relies on explicit function calls, instantiating options manually, and using a `createPermissionIntegrationRouter` to register and pass your permissions to Express. It requires users to pass around an explicit environment block.
- **`@backstage/backend-plugin-api` (Modern Contract):** Uses a declarative **Dependency Injection (DI)** model. Instead of setting up routers manually, your plugin simply asks for `coreServices.permissions` from the system framework. The framework handles the wiring behind the scenes automatically.

#### 2. How to implement Permissions in the New Backend System

Because you are building an agentic workflow group of plugins, you only need to use `@backstage/backend-plugin-api` (along with the lightweight type container package, `@backstage/plugin-permission-common`).

Here is exactly how you write the modern contract:

##### Step A: Define your Permissions (Shared/Common package)

In your shared library package (e.g., `@internal/plugin-agent-workflows-common`), define your granular permission strings:

```typescript
import { createPermission } from '@backstage/plugin-permission-common';

export const agenticWorkflowExecutePermission = createPermission({
  name: 'agentic.workflow.execute',
  attributes: { action: 'update' }, // 'create', 'read', 'update', 'delete'
});
```

##### Step B: Request and check permissions inside your Backend Plugin

In your backend plugin, use `createBackendPlugin` and list `coreServices.permissions` as a required dependency.

```typescript
import { coreServices, createBackendPlugin } from '@backstage/backend-plugin-api';
import { AuthorizeResult } from '@backstage/plugin-permission-common';
import { NotAllowedError } from '@backstage/errors';
import Router from 'express-promise-router';
import { agenticWorkflowExecutePermission } from '@internal/plugin-agent-workflows-common';

export const agenticWorkflowsPlugin = createBackendPlugin({
  pluginId: 'agentic-workflows',
  register(env) {
    env.registerInit({
      deps: {
        httpRouter: coreServices.httpRouter,
        permissions: coreServices.permissions, // <--- Modern DI Service
      },
      async init({ httpRouter, permissions }) {
        const router = Router();

        router.post('/execute/:workflowId', async (req, res) => {
          // 1. Evaluate user credentials seamlessly
          const decision = await permissions.authorize([{ 
            permission: agenticWorkflowExecutePermission 
          }], { credentials: req.credentials });

          // 2. Enforce the decision returned by external systems (like Spotify RBAC)
          if (decision[0].result === AuthorizeResult.DENY) {
            throw new NotAllowedError('Unauthorized to run agentic workflow loops.');
          }

          // 3. Continue execution logic...
          res.json({ status: 'queued' });
        });

        httpRouter.use(router);
      },
    });
  },
});
```

#### Why this guarantees Spotify/OPA Compatibility

When external platforms like **Spotify RBAC** or **Roadie OPA** load an instance of Backstage running your plugin, they inject their own backend module into the `coreServices.permissions` registry loop.

By defining your workflow using `createBackendPlugin` and performing checks via `permissions.authorize`, the system hooks into their active rule evaluator entirely automatically without any vendor-specific code in your repository.

### E.3 `streamRunEvents` authorization hole — ADOPT, fix now

`streamRunEvents` (`controller.ts:348`) fetches a run by ID and replays its events with **no authorization check** — anyone with the runId can read another run's full event stream (tool args, prompts, model output). This is a live IDOR. Adopt: enforce `ai.run.read` scoped to the run's owning identity/session before streaming. Highest-priority security fix in the whole audit.

---

## Section F — Observability / APM extensibility

### F.1 Structured `LoggerService` payloads — ADOPT

`logger.info('Node execution started', { runId, node, workflowId })` structured fields: adopt, trivial, part of the node harness.

### F.2 OTel vendor-neutral tracing + APM — ADOPT (already plan), DECLINE the custom hooks

Vendor-neutral OTel spans: adopt (already in plan). **Decline** the audit's `TracingPluginHook` / `monitoringHook` / `contextFactory` additions. These re-invent what OTel already provides — the point of emitting standard OTel spans is that Datadog/New Relic/Dynatrace ingest them via standard collectors with zero plugin-specific hooks. Adding proprietary hook seams duplicates the standard and creates a maintenance surface. The correct enterprise answer is "we emit standard OTel; point your collector at it," not a bespoke hook API.

---

## Section G — Config / Ops Standards

### G.1 Strict `config.d.ts` + boot-time connectivity probes — ADOPT

Strict config schema: already exists per-plugin; keep and extend. Boot-time health probe against `CheckpointStore` and the configured LLM gateway: adopt — fail-loud at boot is right and cheap (a `SELECT 1` + a model registry ping). Aligned with the plan's "fail boot, not first run" principle.

### G.2 Retention / tombstone purge config — ADOPT (seam in storage module)

Explicit `retention` config driving a background purge of checkpoints / events / artifacts: adopt. Lives in the runtime-store module (it owns the tables), config-driven, hard delete after retention. Straightforward.


---

## Section H — Compliance items (SOC-2 / HIPAA / FINRA)

### H.1 Immutable append-only audit log — ADAPT

Non-repudiation is real and the `AuditLogSink` already exists. Adapt: make `AuditLogSink` append-only by contract (doc + write-once guarantee) and provide the *seam* for an immutable backend (S3 Object Lock / write-once partition). Do not build S3 Object Lock into core — that's a storage-module/driver concern. Bind verified `UserRef` (from E.1) to every audit record, non-nullable. Adopt the contract hardening + seam; decline the cloud-specific sink in core.

### H.2 PHI/PII pre-LLM redaction wrapper — ADAPT

Goal is legitimate (don't leak PHI/PII to external model providers). Adapt into the configurable `RedactionPolicy` (keyPatterns + valuePatterns + mode), applied at the `ModelExecutor` outbound boundary — *before* the request leaves for the provider — in addition to the state/event/checkpoint boundaries in §5.2. **Decline the "tokenize and restore on the way back" round-trip**: reversible de-anonymization requires a server-side token vault and re-identification logic — a large, breach-prone subsystem. For v1 the correct posture is *irreversible* redaction before egress (the model never sees the real value, so there's nothing to restore). If a compliance regime demands reversibility, that's a dedicated vault integration — defer, document, don't build now.

## Section I — Items from Agent Chat

These are items we identified from chat to add to the roadmap plan.

### I.1 `VcsProviderId` Widening

**Provider ID unions in core-node types:** `VcsProviderId = 'github' | 'gitlab' | 'bitbucket' | 'azuredevops'` is a closed union in `@types/vcs.ts`. A third-party VCS provider can't assign a new ID without a type error. Fix (cheap, do it in this refactor): widen these to `string` with a branded/validated pattern, or `string & {}` to preserve autocomplete for known IDs. The driver registry already treats IDs as map keys — the union is pure friction.

### I.2 `usage` Table

Add a first-class, __structured `usage` table__ (or a `UsageSink` contract) in the runtime-store module rather than leaving usage as unstructured step JSON. Columns: `runId`, `agentId`, `workflowRef`, `node?`, `modelRef`, `input`, `output`, `total`, `createdAt`. The per-node `usage` events (with the now-required `node` field from your `AgentEvent` v2) make this trivially queryable. This is a small, high-value addition to §4.4 of the refactor plan — the current plan persists usage but doesn't give it a queryable shape.

### I.3 Configurable Redaction Policy

Today the redaction list is a __hardcoded constant__, not configurable, in `AgentRuntime.ts:46`.  The `redact()` function (line 59) is a pure function over that fixed array. It matches by *key name substring* (`key.toLowerCase().includes(s)`), not by regex.  I checked `config.d.ts` for the core plugin and the runtime-store module's `config.ts` — __neither exposes any `sensitiveKeys` / `redaction` / `secrets` config.__ There is no user-facing way to add or remove patterns.

__Configurability is a genuine gap worth closing in the plan.__ For an enterprise audience, a hardcoded list is a liability — different orgs have different secret shapes (internal token prefixes, custom header names). I'd add to the plan:

- A `RedactionPolicy` contract in core-node: `keyPatterns: RegExp[]` (key-name matching, superset of today's behavior) + `valuePatterns: RegExp[]` (credential-shape scanning) + `mode: 'redact' | 'reject'`.
- Config surface `ai.redaction.*` with sensible secure defaults (today's keys + common token formats), allowing operators to *append* patterns but __not remove the built-in floor__ (a safe default you can widen but not weaken) — important for a security posture claim.
- The harness applies this policy at state-patch, event, and checkpoint boundaries, as §5.2 already states in the refactor plan.

### I.4 Per-plugin provider restriction

New policy field on `AgentDefinition`, enforced in the refactor's `ToolExecutor` — one enforcement point, no per-plugin plumbing. *Restricting* which providers a plugin may use — needs a policy layer, and the refactor is the right place for it

Even with `providerId` on inputs, nothing today **prevents** plugin 1 from naming the internal tool. That's an authorization/policy concern, not a routing concern — and it maps directly onto machinery the refactor already introduces. `AgentDefinition` gains an optional provider policy, enforced by `ToolExecutor` (the single choke point every invocation passes through):

```ts
export type AgentDefinition = {
  // ...existing fields
  /** Per-category provider allow-list. Absent = any registered provider. */
  providers?: Record<string, readonly string[]>;  // e.g. { communication: ['slack'] }
};
```

Enforcement at dispatch: `ToolExecutor` knows the agent, the tool, the tool's category, and the resolved provider; a mismatch is a `tool_denied` error event, audited — same posture as allow-list and write-gating. Operators get a config mirror (`ai.agents.<id>.providers`) for installation-level overrides. This is structurally identical to how `toolIds` already scope *which tools* an agent may use; `providers` scopes *which backends* those tools may reach.

