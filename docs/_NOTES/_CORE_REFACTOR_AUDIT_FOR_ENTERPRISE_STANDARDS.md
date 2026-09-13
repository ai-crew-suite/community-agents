# Core Refactor Audit

These are issues that we should address to ensure our refactored core plugin meets enterprise quality standards.

## Error Handling / Express Middleware for Error Handling

For an enterprise-grade Spotify Backstage backend plugin orchestrating AI agents, error handling must balance **internal robustness (for platform engineers)** with **actionable clarity (for application developers)**. Enterprise customers expect absolute visibility into infrastructure failures, zero leaked internal secrets, and clean integration with Backstage platform primitives.

Enterprise-quality plugins in the Backstage ecosystem follow a highly standardized approach across four operational layers:

### Leverage `@backstage/errors` Typed Classes

Never throw generic `Error` strings. Backstage provides a specialized package called `@backstage/errors` containing standard semantic error definitions. These classes carry automatic HTTP status code associations (`statusCode`) and help Backstage middleware safely serialize errors across boundaries without risking code fragility.

Map your core runtime errors directly to these types before bubble-up:

- **`InputError` (HTTP 400):** Use this when a user inputs a malformed repository or missing payload that fails your workflow’s `inputSchema`.
- **`NotFoundError` (HTTP 404):** Use this when an agent references a `runId` or `checkpoint` that does not exist in your `CheckpointStore`.
- **`ConflictError` (HTTP 409):** Use this if a user tries to submit an approval decision to a node that has already transitioned or timed out.
- **`NotAllowedError` (HTTP 403):** Use this when Backstage's permission framework rejects an execution request.

### Centralized Express Middleware Filtering

Enterprise plugins utilize the standardized Error Middleware provided by Backstage defaults (`MiddlewareFactory.create().error`).

- **Sanitization:** In your express router, catch all unhandled operational failures (like an LLM endpoint timing out or a LangGraph exception) and wrap them cleanly.
- **Never Expose Internal Traces:** Ensure your production environments omit internal agent engine stack traces or low-level Python/Node runtime logs from the HTTP network payload. Pass clean error boundaries to the frontend while logging the verbose trace safely on the backend server.

### Asynchronous Error Propagation via SSE (The Agent Paradox)

Because your agent workflows run asynchronously over Server-Sent Events (SSE), standard HTTP request/response error handling only handles the *initial trigger phase*.

Once a run is executing, errors must be serialized into your custom `AgentEvent` v2 union (`type: 'error'`) rather than blowing up the network channel.

- **Distinguish Operational vs. Transient:** Ensure your backend correctly flags the `retryable: boolean` property. If a tool fails due to a flaky 3rd-party network timeout (`tool_failed`), it should register as `retryable: true`. If a Zod type schema assertion fails (`state_validation`), it must flag as `retryable: false`.
- **Budget Exhaustion Enforcements:** An enterprise runtime must track execution steps. If your sequence numbers (`seq`) exceed safety caps, force abort the LangGraph thread and broadcast an explicit `budget_exceeded` error code before it spins out of control and exhausts client API budgets.

### Integration with Backstage `ErrorApi` and OpenTelemetry

Enterprise buyers evaluate platform plugins heavily on their observability.

- **Backend Tracing:** Inject your platform's OpenTelemetry trace context down into the `NodeExecutionContext (ctx)` of your nodes. Any thrown exception within a custom LangGraph node should automatically create an OpenTelemetry exception span recording the exact `node` and `runId`.
- **Frontend Surface Pipeline:** Ensure your frontend plugins consume the asynchronous `AgentEvent` errors and route fatal, unexpected core crashes to Backstage's global standard `ErrorApi` via `errorApi.post(error)`. This triggers the platform's global error reporting frameworks and notifies administrative log collection mechanisms automatically.

### Architectural Design Checklist for Your Plan

| Target Failure | Catch Mechanism | Propagation Target | Enterprise Benefit |
| --- | --- | --- | --- |
| **Invalid Initial Trigger YAML** | Zod + `InputError` | Sync HTTP HTTP 400 | Instant feedback to user before run allocation. |
| **Flaky LLM Gateway / Proxy** | Retries + `model_failed` | SSE `AgentEvent` v2 | Keeps SSE connection open while showing retry state. |
| **Malformed Plugin Code Output** | Zod validation on Node Exit | SSE `state_validation` | Halts execution gracefully instead of corrupting database state. |
| **Database Connection Failure** | `CheckpointStore` wrapper  | OpenTelemetry Span + Log | Keeps enterprise infrastructure teams alerted via standard metrics. |

## Core Router

Here is an architectural evaluation of your existing router, followed by specific recommendations to elevate it to production quality:

### 🔴 Critical Issues (Must Address for Enterprise Quality)

#### Inconsistent Error Shape (Bypassing `@backstage/errors`)

Inside `sourceValidator` and `queryValidator`, you manually write HTTP status codes and custom JSON shapes:

```typescript
return res.status(422).json({ message: '...' });
```

- **The Problem:** This completely defeats the purpose of mounting `middleware.error()` at the bottom of your router. Backstage expects plugins to throw structured exceptions (e.g., from `@backstage/errors`) so the framework can uniformly format logs, hide server internals, and present a predictable schema to frontend plugins.
- **The Fix:** Replace `res.status(422).json` with `throw new InputError(...)`.
- Lack of Authentication and Authorization Gates

Enterprise deployments require strict access control. The route definitions (`/agents/:id/runs`, `/runs/:id/approvals`) currently lack an auth validation layer.

- **The Problem:** Anyone or any unauthenticated service within the corporate network can trigger runs, execute arbitrary agentic tools, or artificially approve dangerous workflow state changes.
- **The Fix:** Inject `HttpAuthService` into your options and extract user credentials at the router or middleware level before invoking controllers.

### 🟡 Architectural Gaps & Observations

#### Ad-Hoc Validation vs. Zod Contracts

Your `queryValidator` uses basic manual type checks (`typeof query !== 'string'`). While functional, it diverges from the type-safe Zod schema philosophy established in your new `WorkflowDefinition` DSL. Moving toward structured validation ensures the router blocks bad inputs deterministically before execution resources are provisioned.

#### Hardcoded HTTP 422 for Routing Logic

Using `HTTP 422 Unprocessable Entity` for a missing source registry check is a semantic mismatch. If a user requests a source that does not exist in your active `SourceRegistry`, it should bubble up as an `HTTP 404 NotFoundError` or a highly specific validation error.

#### Unprotected Streaming Contexts

The endpoint `/runs/:id/events` hooks up `controller.streamRunEvents` (your Server-Sent Events target). Ensure that your controller layer handles proxy buffering issues (e.g., setting `X-Accel-Buffering: no` and `Cache-Control: no-transform`) so corporate firewalls don't truncate the stream.

### 🟢 What Your Code Gets Right

- **`express-promise-router` Usage:** You successfully imported and utilized the promise-aware router. This means when you shift your middlewares to use `throw new Error()`, your async paths will naturally pass the exceptions down to the error middleware without dangling connection threads.
- **Clean Separation of Concerns:** Using a `bindRoutes` loop keeps your router setup decoupled from your controller implementations, easing long-term maintenance.

### Refactored, Enterprise-Ready Router Example

Here is how you can refactor your file to fix these vulnerabilities while matching standard Backstage plugin expectations:

```typescript
import express, { type NextFunction, type Request, type Response } from 'express';
import Router from 'express-promise-router';
import { MiddlewareFactory } from '@backstage/backend-defaults/rootHttpRouter';
import { InputError, NotFoundError } from '@backstage/errors'; // ◄ Standardized errors
import { SourceRegistry } from '@ai-crew-suite/plugin-kernel-node';
import type { CreateRouterOptions, RouteController } from '../@types';

/**
 * Validates that a requested source exists in the active source registry.
 */
export const sourceValidator = (sourceRegistry: SourceRegistry) => 
  (req: Request, _res: Response, next: NextFunction) => {
    const source = req.params.source;
    if (!sourceRegistry.has(source) && source !== 'all') {
      const supported = sourceRegistry.list().map(it => it.id).join(', ');
      // ◄ THROW instead of res.status().json() to leverage Backstage error parsing
      throw new NotFoundError(
        `Source '${source}' is invalid. Supported query sources: ${supported}`
      );
    }
    next();
  };

/**
 * Ensures embedding query endpoints receive a non-empty query string.
 */
export const queryValidator = (req: Request, _res: Response, next: NextFunction) => {
  const query = req.query.query;
  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    throw new InputError('The target parameter "query" must be provided as a non-empty string.');
  }
  next();
};

export function bindRoutes(
  router: express.Router,
  controller: RouteController,
  sourceRegistry: SourceRegistry,
) {
  const sourceValidatorMiddleware = sourceValidator(sourceRegistry);

  router
    .route('/embeddings/:source')
    .post(sourceValidatorMiddleware, controller.createEmbeddings)
    .delete(sourceValidatorMiddleware, controller.deleteEmbeddings)
    .get(sourceValidatorMiddleware, queryValidator, controller.getEmbeddings);

  router.route('/agents').get(controller.listAgents);
  router.route('/agents/:id/runs').post(controller.startRun);
  router.route('/runs/:id/events').get(controller.streamRunEvents);
  router.route('/runs/:id/approvals').post(controller.approveRun);
  router.route('/triggers/:source').post(controller.triggerRun);
  router.route('/webhooks/:provider').post(controller.webhookRun);

  return router;
}

export function createRouter({
  logger,
  sourceRegistry,
  controller,
  config,
}: CreateRouterOptions): express.Router {
  const router = Router();
  router.use(express.json());

  bindRoutes(router, controller, sourceRegistry);

  // ◄ Caught errors now pass through here, formatting cleanly into a unified JSON structure
  const middleware = MiddlewareFactory.create({ config, logger });
  router.use(middleware.error());

  return router;
}
```

### Needed to Align with Enterprise Backstage Standards

1. **`express-promise-router` Core Dependency:** Standard Express doesn't handle native `async/await` exceptions gracefully—it requires wrapping blocks in repetitive `try/catch` wrappers that call `next(err)`. Using `express-promise-router` ensures that any thrown error instantly bubbles straight down to your global Backstage middleware stack.
2. **Deterministic Validation Boundary:** It forces validation of user input data *before* reserving any database thread space or spinning up an execution context. This minimizes data mutations and resource leaks from malformed API requests.
3. **Information Disclosure Prevention:** Notice how the `catch` blocks log the explicit developer details (`error.message`) safely to the secure platform logging mechanism (`logger.error`), but throw a sterile, normalized error message back across the network to prevent leaking underlying cloud infrastructure metadata or source configurations to unauthorized API consumers.
4. **`no-transform` & `X-Accel-Buffering` Header Guards:** In enterprise environments, corporate infrastructure like firewalls, proxies (e.g., Zscaler, Blue Coat), or reverse proxies (e.g., Nginx) sit between Backstage and the developer. These proxies often eagerly batch or compress incoming responses, which completely breaks real-time chunk streaming. These specific headers command proxy systems to immediately let network packets pass straight through.
5. **Asynchronous Separation of Concerns:** If a tool crashes or an LLM times out mid-execution, your runtime engine catches it inside the `onError` hook. Instead of crashing the active Express request context or leaking raw infrastructure traces, it maps the failure to your domain-specific `AgentEvent` array, delivers it cleanly to the UI, and wraps up the request context safely using `res.end()`.
6. **Preventing Memory and Connection Leaks:** When an enterprise engineer closes their Backstage dashboard tab mid-run, `req.on('close')` catches the event. By executing the engine's `unsubscribe()` mechanism right away, you kill any dangling pub/sub event listeners, ensuring your Node process doesn't leak memory or leave phantom connection threads open.

## Issues with our current Controller `plugins/backend/plugin-ai-core-backend/src/service/controller.ts`

To make sure your `RouteController` implementation is truly enterprise-grade, it needs to be evaluated on how it handles the **hand-off between your HTTP surface and the asynchronous LangGraph execution engine**.

Because your `RouteController` is defined as a clean `Pick` of method references, your router looks highly modular. However, the runtime code *inside* `startRun` and `streamRunEvents` is where the critical enterprise constraints we discussed (such as Backstage identity, token protection, and memory leaks) are either successfully enforced or silently bypassed.

Here is exactly how those enterprise requirements apply directly to the implementation code of those two methods:

1. In `startRun`: Thread Isolation and User Accountability

When a user clicks "Run Agent" in Backstage, your router invokes `controller.startRun`. An enterprise-grade implementation of this method must handle three hidden requirements:

- **Binding the Backstage Identity to the LangGraph State:** You cannot just start a thread. You must extract the user's `userRef` from the incoming Backstage request credentials and inject it explicitly into the initial workflow state. This ensures that every down-stream tool or audit log generated by LangGraph knows exactly which human triggered it.
- **Idempotency Safeguards:** If an enterprise automation platform or webhook calls `startRun` twice due to a network stutter, your controller should accept an optional `X-Idempotency-Key` header. It must check your `CheckpointStore` before starting a brand-new run to ensure it doesn't spin up duplicate, billing-heavy LLM execution threads for the same request.
- **Preventing Blocked Node.js Threads:** Launching an agent run shouldn't block the Express HTTP request thread. `startRun` should write the initial `seq: 0` checkpoint, kick off the LangGraph runner asynchronously in the background, and immediately return an HTTP 201 response with the `runId` back to the client.
- In `streamRunEvents`: Resiliency Behind Enterprise Firewalls

Your `/runs/:id/events` endpoint delegates entirely to `controller.streamRunEvents`. This method manages a long-lived Server-Sent Events (SSE) pipe. It has to survive hostile enterprise infrastructure:

- **Injecting Proxy-Defeating Headers:** As we built in the router example, this controller method must actively flush headers like `X-Accel-Buffering: no` and `Cache-Control: no-transform` to prevent corporate firewalls (like Zscaler) or API gateways from buffer-throttling your text streams.
- **The Heartbeat Loop:** If your LangGraph engine takes 45 seconds to process a complex chain of tool iterations without emitting user-facing text, enterprise load balancers (like AWS ALB) will assume the HTTP connection is dead and drop it. `streamRunEvents` must maintain an internal `setInterval` that safely pumps silent SSE comment packets (`:\n\n`) to keep the pipe open.
- **Cleaning Up Dangling Subscriptions:** When a user navigates away from the Backstage tab, the request closes. Your `streamRunEvents` implementation must catch the `req.on('close')` signal and actively unregister its pub/sub handle from the underlying LangGraph execution loop. If it forgets to do this, every single run will leak memory, eventually causing your Backstage backend process to run out of memory (OOM) and crash.

### Conceptual Blueprint for `startRun` and `streamRunEvents`

Here is an architectural blueprint of how your `WorkflowController` should implement these two specific functions to honor those criteria:

```typescript
export class WorkflowController {
  // ... dependencies injected via constructor (engine, store, logger)

  async startRun(req: Request, res: Response): Promise<void> {
    const { id: agentId } = req.params;
    const body = req.body;

    // 1. Enforce Accountability: Extract authenticated Backstage user context
    const userRef = req.user?.identity?.userRef ?? 'user:default/anonymous';

    // 2. Delegate to background engine without blocking the Express response loop
    const runId = await this.engine.createNewThread({
      agentId,
      input: body.input,
      triggeredBy: userRef,
    });

    // 3. Instant feedback loop for the client
    res.status(201).json({ runId, status: 'started' });
  }

  async streamRunEvents(req: Request, res: Response): Promise<void> {
    const { id: runId } = req.params;

    // 1. Establish strict SSE networking guards
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    // 2. Set up the firewall keep-alive heartbeat ping
    const heartbeat = setInterval(() => {
      res.write(':\n\n'); // Standard SSE comment block ignored by UIs
    }, 15000);

    // 3. Connect our clean AgentEvent stream to the network pipe
    const unsubscribe = this.engine.subscribeToRun(runId, {
      onEvent: (event) => res.write(`data: ${JSON.stringify(event)}\n\n`),
      onComplete: () => {
        clearInterval(heartbeat);
        res.end();
      }
    });

    // 4. Critical cleanup to prevent severe memory leak accumulation
    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  }
}
```

This first section of your controller file provides an excellent window into your current system state. There are several positive elements here—such as an active, structural **idempotency check**, an **abort controller mechanism**, and a local **rate-limiting algorithm** inside `startRun`.

However, looking at this code alongside your new `WorkflowDefinition` DSL and architectural goals, we can identify several immediate conflict zones and enterprise gaps.

### 🔴 Core Structural Conflicts

#### Incompatible Streaming Engine Pattern

Look at how `startRun` begins setting up the network stream:

```typescript
res.writeHead(200, {
  'Content-Type': 'text/event-stream',
  Connection: 'keep-alive',
  'Cache-Control': 'no-cache',
});
```

- **The Problem:** Your current controller mixes **run initialization** and **real-time event streaming** inside the exact same HTTP `POST /agents/:id/runs` endpoint.
- **Why it breaks your new architecture:** Your `AgentEvent` v2 and `CheckpointStore` specifications explicitly declare a detached lifecycle model where `startRun` handles synchronous creation (`POST`) and a dedicated `/runs/:id/events` handles streaming (`GET`). Keeping them coupled prevents clients from reconnecting to a broken connection mid-execution without spawning an entirely new agent thread.

#### Technical Debt: Leaking the Omitted Fallback Array

Your `listAgents` function maps internal properties out to the frontend:

```typescript
orchestrator: agent.orchestrator ?? 'single-shot',
```

**The Problem:** In your new `AgentDefinition` changes, you explicitly **removed** the `orchestrator` and `crew` properties, rendering all fallback loops obsolete. Leaving this fallback logic in place will result in compilation breaks as soon as you update the core types.

### 🟡 Enterprise-Grade Omissions

#### Bypassing Unified Error Models

Just like your router, this controller relies extensively on manual status injection (`res.status(422).send({ message: '...' })`).

In a best-of-class platform, an invalid agent id should instantly trigger a thrown `NotFoundError`, allowing Backstage middleware to process standard logging context and prevent localized payload formatting fragmentation.

#### Missing Corporate Proxy Headers

While you initialize standard SSE properties, you are missing the `no-transform` cache-control flag and the `X-Accel-Buffering: no` header rule. In large enterprise environments, corporate gateways or local reverse proxies will buffer your partial chunks, delaying word-by-word streaming updates until the full execution thread ends.

#### "Anonymous" Default Session Hardcoding

```typescript
await this.sessionStore.createSession(selectedAgent.id, 'anonymous')
```

**The Problem:** Hardcoding the user identifier to `'anonymous'` breaks the compliance and audit requirements of enterprise software platforms. It should actively pull the authenticated `userRef` extracted via the router's identity context to trace run lifecycles.

Your current `WorkflowController` contains strong architectural primitives—such as clean client-disconnect tracking (`attachAbortOnClose`), a slide-window rate limiter (`consumeRateLimit`), and historical replay handling via `Last-Event-ID` (`streamRunEvents`).

However, when audited against your **new LangGraph orchestration model**, your **v2 AgentEvent schemas**, and **enterprise-grade standards**, this controller file reveals severe vulnerabilities and immediate code-breaking structural conflicts.

### 🔴 Critical Structural Conflicts & Vulnerabilities

#### Severe Memory Leaks in Multi-Tenant Environments

Look closely at your connection closure tracking method:

```typescript
private attachAbortOnClose(req: Request, res: Response, controller: AbortController, timeout?: NodeJS.Timeout): void {
  const onClose = () => {
    // ... logic
    req.off('close', onClose);
    res.off('close', onClose);
  };
  req.on('close', onClose);
  res.on('close', onClose);
}
```

- **The Vulnerability:** If a connection ends normally (reaches `res.end()`), the `onClose` callback **never fires**. Because `req.on('close')` and `res.on('close')` are left attached to the underlying long-lived Node network socket, these callbacks pool up in memory. In an enterprise system processing thousands of runs, this will trigger a **severe memory leak**, eventually crashing your entire Backstage backend process via an Out Of Memory (OOM) error.
- **The Fix:** Remove the listeners explicitly in a `finally` block or within the main loop execution path once `res.end()` is invoked.

#### Localized, Volatile Rate Limiting (Broken in Clusters)

Your sliding-window calculation relies entirely on an in-memory Map:

```typescript
private readonly rateLimitBucket = new Map<string, number[]>();
```

- **The Problem:** In an enterprise cluster, your Backstage backend scales horizontally across multiple distinct instances or Kubernetes Pods. An in-memory Map cannot share data across node boundaries. A malicious script or misconfigured pipeline can hammered an agent, bypassing the rate limit entirely by hitting alternating servers.
- **The Fix:** Move the sliding-window aggregation logic to a distributed store (e.g., using Redis or your platform database via standard Backstage key-value configurations).

#### Broken `identity` Hardcoding for Audits

Across `executeRun` and `approveRun`, you pass generic placeholders:

```typescript
identity: 'anonymous',
identity: decision.decidedBy ?? 'anonymous'
```

**The Problem:** This breaches basic compliance criteria (like SOC2/ISO 27001). For enterprise safety, you must actively extract the authenticated user identity via your router's `HttpAuthService` context and pass a validated `UserRef` down to the graph engine.

#### Disconnected SSE Streaming Paradigm

Your endpoints (`startRun`, `triggerRun`) are structured around a streaming loop:

```typescript
for await (const event of this.executeRun(...)) { this.writeEvent(res, event); }
```

- **The Problem:** As discussed, your new architecture decouples this pattern entirely. A `POST /runs` or `POST /triggers` request should instantly initialize a thread configuration, persist the state metadata, and return an immediate HTTP 201 response. The actual event stream must live standalone inside `streamRunEvents` to ensure clients can seamlessly re-establish broken telemetry links without spinning up duplicate executions.

### 🟡 Minor Implementation Anomalies

#### Divergent Serialization Implementations

Look at how you construct raw SSE payload text strings inside `writeEvent`:

```typescript
res.write(`event: ${event.type}\n`);
res.write(`data: ${JSON.stringify(event.data)}\n\n`);
```

Compare this to how your client-facing v2 spec assigns properties:

```typescript
{ type: 'token'; data: { runId: string; node: string; text: string } }
```

- **The Gap:** Your backend serializes events using a native SSE event boundary formatting rule (`event: type`). However, your frontend `AgentEvent` v2 union expects the full discriminated object structure (`{ type, data }`) bundled as a single JSON literal inside a generic payload frame. This schema mismatch will break your frontend reducers.

### Recommended Remediation Steps for Your Plan

1. **Decouple Router & Execution Execution Tasks:** Re-architect `startRun` and `triggerRun` to write initial checkpoints to the `CheckpointStore` and return immediately instead of resolving an active `for await` iterator loop.
2. **Move Telemetry Streaming into `streamRunEvents`:** Migrate the `executeRun` runtime engine subscriber hook strictly into your dedicated `GET /runs/:id/events` line.
3. **Inject Identity Mapping:** Ensure your router actively forwards authenticated credentials down to the controller methods to replace any `'anonymous'` placeholders.

## Allow Integration of Custom Trace Spans, APM Platforms (like **Datadog, New Relic, or Dynatrace**), and Specialized Monitoring Tools

To allow enterprise customers to integrate their custom trace spans, APM platforms (like **Datadog, New Relic, or Dynatrace**), or specialized monitoring tools, you must avoid tying your core engine to a specific vendor.

In a well-designed Spotify Backstage plugin, this extensibility is achieved by leveraging **Backstage's standard Dependency Injection (DI) system** alongside open observability standards.

Enterprise customers can seamlessly inject their custom monitoring formats using three core strategies:

### Leverage the Standard Backstage `LoggerService`

Backstage provides a unified, injectable logging abstraction (`LoggerService`). When enterprise customers deploy your backend plugin, they pass their standard logging provider into your router initializer.

- **How they customize it:** If a customer uses **Winston** or a custom JSON logging schema for indexing into **Splunk** or **Elasticsearch**, your plugin automatically inherits it.

- **Your implementation:** Ensure every operational step in your Core engine logs contextual metadata fields (like `runId`, `node`, and `workflowId`) in a flat object payload rather than a string message:

  ```typescript
  // Good: Structured logging allows corporate log processors to parse spans perfectly
  logger.info('Node execution started', { runId, node, workflowId });
  ```

### Provide a Clean OpenTelemetry (OTel) Hook Architecture

Most modern enterprise software platforms rely on **OpenTelemetry** for trace collection. Instead of writing separate plugins for Datadog and Dynatrace, your engine should initialize generic OTel `Tracer` spans, allowing customers to capture them natively using standard OpenTelemetry collectors.

To allow hyper-specific telemetry customizations, expose a **Tracing Middleware Hook** inside your `RouterOptions` configuration object:

```typescript
export interface TracingPluginHook {
  /** Fires right before a node begins executing */
  onNodeStart?: (params: { runId: string; node: string; workflowId: string }) => void;
  /** Fires when a node finishes or fails, allowing custom span attribute injection */
  onNodeEnd?: (params: { runId: string; node: string; error?: Error }) => void;
}

interface RouterOptions {
  logger: LoggerService;
  checkpointStore: CheckpointStore;
  workflows: Map<string, WorkflowDefinition>;
  engine: any;
  /** Optional customer extension point for proprietary monitoring systems */
  monitoringHook?: TracingPluginHook; 
}.
```

### Expose a Extensible Context Factory

Recall the `ctx` object (`NodeExecutionContext`) inside your node definitions from your workflow DSL. This is the ultimate pipeline for enterprise extension.

Allow customers to register a custom `contextFactory` during plugin initialization. This lets them attach custom monitoring spans directly to the context object passed into every node function:

```typescript
// How an enterprise customer initializes your plugin in their Backstage backend instance:
import { createRouter } from '@backstage/plugin-agentic-core-backend';

const router = await createRouter({
  logger,
  checkpointStore,
  workflows,
  engine,
  // Custom factory to inject vendor-specific tracing contexts down into individual node loops
  contextFactory: async (baseCtx, req) => {
    const parentTraceId = req.headers['x-trace-id'];
    
    return {
      ...baseCtx,
      // Injecting a proprietary tracking instance down into the plugin node execution lifecycle
      customApmTracker: myEnterpriseApm.createSpan({ 
        name: `agent-node-execution`,
        traceId: parentTraceId 
      })
    };
  }
});
```

### Architectural Extensibility Summary

| Monitoring Choice | Implementation Vector | Responsibility |
| --- | --- | --- |
| **Standard APM (Datadog/Dynatrace)** | Native OpenTelemetry integration wrapped around Core execution paths. | **Your Plugin** emits standard traces; **Customer** pipes them to their collector. |
| **Corporate Log Format (Splunk/Elastic)** | Backstage Core `LoggerService` pass-through. | **Your Plugin** emits structured JSON objects; **Customer** configures their standard log forwarder. |
| **Proprietary Internal Tracking Tools** | Customizable `contextFactory` and `monitoringHook` properties. | **Your Plugin** provides execution hooks; **Customer** safely wires up their proprietary internal SDK libraries. |

## Audit Items

### Security & Identity Isolation

- **Backstage Token Verification:** Every HTTP request must pass through Backstage's `HttpAuthService` or standard identity middleware to authenticate the user. It must reject requests lacking a verifiable `BackstageCredentials` token.
- **Credentials Isolation:** The plugin must never load raw environment variables (e.g., `process.env.OPENAI_API_KEY`) directly inside its business logic. All secrets must route strictly through the centralized Backstage `Config` engine (`config.getString('backend.providers.agentic.apiKey')`).
- **LLM Data Confidentiality and PII Leaks:** When shipping a plugin interacting with external LLMs, include explicit toggle switches allowing enterprise admins to filter out sensitive corporate markers (e.g., project names, internal user emails) from prompt templates or telemetry before payloads leave the internal perimeter.
- **Input Injection Defense:** All execution trigger points must parse inbound payloads against explicit schemas (like your Zod-validated `inputSchema`) to block path-traversal injections, shell execution triggers via tools, or untrusted payload processing.

### Resiliency & Resource Guardrails

- **Database Connection Pooling & Circuit Breaking:** The database interactions layer (e.g., your `CheckpointStore`) must hook cleanly into standard Backstage database managers (`DatabaseManager`). It must utilize proper connection pooling and leverage automatic circuit-breaker retries to gracefully handle sudden connection drops without crashing the Node runtime.
- **Streaming Timeout and Keep-Alive Heartbeats:** Server-Sent Events (SSE) streaming connections must enforce explicit client heartbeats (e.g., writing a comment byte `:\n\n` every 15–30 seconds) to prevent enterprise firewalls and load balancers from killing idle streams during prolonged agent reasoning loops.
- **LLM Gateway Backoff & Rate-Limit Handling:** When external models throw a `429 Too Many Requests` or `503 Service Unavailable`, your engine must apply **Exponential Backoff with Jitter** rather than spinning out on infinite immediate loops, which can quickly exhaust corporate API credits or blow up logs.
- **Tombstone Cleanup Automations:** The soft-delete "tombstoning" cleanup logic must be registered as a native Backstage background task (`TaskScheduler`), enabling safe distributed cron triggers across clustered, multi-instance Backstage backend deployments.

### Observability & Platform Alignment

- **Structured Logging Standards:** Every log entry must utilize the standard Backstage `LoggerService`, outputting clean, flat JSON objects (never raw template strings) with consistent telemetry fields like `runId`, `workflowId`, and `userRef` to allow immediate indexing in Splunk, Datadog, or Elasticsearch.
- **W3C Distributed Tracing Propagation:** The backend must parse standard incoming trace context headers (`traceparent`, `tracestate`) from the frontend app or corporate proxies. It should automatically attach these contexts to OpenTelemetry spans wrapping your LangGraph steps to preserve continuous tracking across systems.
- **Backstage Permission Framework Integration:** Guard operational mutations (like `POST /runs` or resolving human approvals) with the Backstage `@backstage/plugin-permission-node` library. This allows enterprise buyers to restrict agent execution permissions to specific LDAP groups or user roles.
- **Clean Software Versioning & Migration Schemas:** Any change to your database structure or your `stateVersion` must carry a dedicated database migration file using standard Knex/Backstage migration formats, ensuring non-breaking upgrades for customer platform teams.

### State Persistence & Graph Consistency

- **Optimistic Concurrency Control:** When a human decision is posted to `/runs/:id/approvals`, your `CheckpointStore` must use a write-guard (like checking the sequence number or a state hash) to prevent race conditions if multiple admins click an approval button simultaneously.
- **Idempotent Node Replay:** If a transient error occurs during a LangGraph execution step, the engine will attempt to resume. Verify that your core plugin provides an **idempotency key** via `NodeExecutionContext (ctx)` so your domain tools (like triggering a GitHub PR creation) do not execute twice on retry.
- **Large State Memory Offloading:** Enterprise state channels can grow quite large if agents accumulate extensive tool context or massive JSON trees. Verify your `CheckpointStore` handles database limits cleanly, potentially offloading heavy payloads to blob storage (like S3/GCS) and storing a reference hash in the relational database instead of bloating text blocks.

### External LLM Defenses & Operational Safety

- **Token Maximizer / Infinite Loop Breaker:** LangGraph agents can occasionally enter "agentic loops" where they repeatedly query a model without progressing. Your core engine must enforce a hard execution ceiling on the sequence counter (`seq`) or max wall-clock time per run to protect customers from overnight budget depletion.
- **Asynchronous Circuit Breaking:** If the external LLM provider goes down, your orchestration engine must stop accepting new run requests instantly (`POST /agents/:id/runs`), failing gracefully with a `503 Service Unavailable` message before allocating internal compute and memory resources.
- **Secret Masking in Traces and Spans:** Ensure that your prompt constructors and tool execution logging mechanisms strip out bearer tokens, passwords, or personal keys that users accidentally pass as variables before writing data to your standard observability logs.

### Backstage Infrastructure Compliance

- **Clustered Background Job Isolation:** In an enterprise cluster, the Backstage backend scales horizontally across multiple Kubernetes pods. Ensure any cleanup routines (like purging tombstoned runs) or persistent polling mechanisms use Backstage's `@backstage/backend-plugin-api` `TaskScheduler` with a cluster-wide lock to prevent multiple pods from conflicting over database records.
- **CSP (Content Security Policy) Compliance:** Because Backstage web frontends enforce strict Content Security Policies, verify your backend provides safe, pre-configured policy rules if your plugin relies on loading assets, avatars, or dynamic markdown images from external LLM storage spaces.

### Multi-Tenant Execution Isolation

- **Resource Quotas per Component:** In Backstage, different engineering software components have different owners. Your core plugin should track token usage and execution frequency grouped by **Backstage Entity ownership** (e.g., `group:default/team-alpha` vs. `group:default/team-beta`). This prevents a single experimental team from consuming your entire corporate LLM budget or rate limits.
- **Contextual Data Leaks Between Runs:** Ensure that your LangGraph thread memory allocator completely purges memory buffers and local variables when a execution thread finishes or errors out, preventing data remnants from bleeding into another user's completely separate workflow context.

### Backstage App Configuration Standards (Validation at Boot)

- **Strict Configuration Schema (`config.d.ts`):** High-quality Backstage plugins must export a `config.d.ts` file that explicitly outlines every allowed configuration block for `app-config.yaml` using structural TypeScript validation.
- **Proactive Startup Connectivity Verification:** When the Backstage backend server initializes, your plugin's entry point should run a lightweight health probe against both your local `CheckpointStore` and your configured external LLM proxy/gateway. If authentication keys are broken or connection strings are invalid, the plugin should fail loudly at boot time instead of failing quietly and throwing errors only when a developer attempts a live run.

### Compliance and Audit Trails

- **Immutable User Accountability:** For corporate compliance (e.g., SOC2, ISO 27001), your plugin must ensure that whenever a human interacts with an `/approvals` gate, the exact Backstage `UserRef` of the reviewer is permanently stamped into the immutable `CheckpointRecord`. It must be impossible to alter who authorized a deployment or infrastructure mutation after the fact.
- **Complete Context Retention Controls:** Provide an explicit `retention` configuration in the `app-config.yaml` file so enterprise legal and security teams can mandate exactly how long code snippets, tool outputs, and LLM conversations are allowed to sit in your `CheckpointStore` before the tombstone worker purges them forever.

### Advanced Tool Isolation Guardrails

- **Ephemeral Container Sandboxing (For Code Execution Tools):** If your plugins expose powerful tools that execute code natively (such as linting, formatting, or building tests generated by an LLM), your Core architecture must provide a way to offload those actions into ephemeral, sandboxed runtimes (like a temporary Kubernetes Pod or secure container runtime) rather than executing arbitrary generated code directly inside the primary Backstage Node.js backend process.

## Compliance Audit Items

To ensure your Spotify Backstage core orchestration plugin meets the rigorous auditing criteria required by **SOC-2 Type II, HIPAA, or FINRA** environments, you must add strict security, non-repudiation, and encryption controls [2.1].

Here are the specific compliance-level audit items you should add to your implementation plan:

### Immutable Audit Logging (Non-Repudiation)

- **Tamper-Evident Run Logs:** Every node execution step, tool call, configuration change, and human approval must be piped to your `AuditLogSink`. In compliance environments, these logs must be written to an immutable, append-only storage destination (like an AWS S3 bucket with Object Lock enabled or a write-once database partition).
- **Deterministic Session Mapping:** For **FINRA** and **SOC-2**, you cannot log arbitrary strings for user actions. The system must bind the cryptographically verified Backstage `UserRef` (extracted from the `HttpAuthService` token) directly to every database mutation. The user ID field must be strict, non-nullable, and never fallback to an unauthenticated value.

### Comprehensive Data Sanitization & PHI/PII Redaction (HIPAA)

- **Automated Data Scrubber Interceptors:** Because models process unstructured text, your core engine needs an active **PII/PHI redaction wrapper** that intercepts inputs *before* they leave your network boundary to external LLM providers.
- **Masking Rules:** This component must scrub or tokenize protected fields—such as Social Security Numbers, Medical Record Numbers (MRNs), bank account numbers, or healthcare conditions—replacing them with benign tokens (e.g., `[REDACTED_PATIENT_ID]`) and restoring them only on the way back to the authenticated user's UI.

### Cryptographic State Isolation (Data at Rest & In Transit)

- **Field-Level Checkpoint Encryption:** Your `CheckpointStore` saves complete snapshots of your workflow state tensors or variables (`state: unknown`) at every sequence boundary. For strict compliance, these serialized state objects must undergo **field-level encryption at rest** using corporate-managed keys (like AWS KMS or HashiCorp Vault) before being saved to the database. This ensures that even database administrators cannot read sensitive code blocks or variable data stored in raw text fields.
- **TLS Enforcements in Transit:** Force strict `TLS 1.3` (or minimum `TLS 1.2` with approved strong cipher suites) across all internal and external network connections—including the streaming Server-Sent Events (SSE) pipe, database connection pools, and downstream external LLM API gateway configurations.

### Advanced Tool Execution Isolation & Data Retention

- **Sandboxed Tool Boundaries:** If an agent calls a tool that evaluates code, analyzes a repository, or modifies infrastructure, that tool *must not* execute directly on your primary Backstage Node.js host. It must run inside an isolated, short-lived sandbox environment (like an ephemeral AWS gVisor container or specialized Kubernetes Pod) that completely deletes its volume storage immediately upon execution exit.
- **Deterministic Tombstone Hard-Purges:** For frameworks with strict data retention rules, your background worker task must guarantee that when a run is marked deleted, it completely purges all historical `CheckpointRecords` and trace spans from physical storage disks after the compliance retention period expires, rather than just leaving them flagged as soft-deleted indefinitely.

### Compliance Mapping Checklist

| Compliance Framework | Target Audit Vector        | Core Implementation Strategy                                 |
| -------------------- | -------------------------- | ------------------------------------------------------------ |
| **SOC-2 Type II**    | Continuous Audit Trails    | Append-only `AuditLogSink` capturing all human approvals and infrastructure tool mutations. |
| **HIPAA**            | Patient Privacy Protection | Inbound pre-LLM data scrubbing middleware to prevent leakage of PHI/PII data vectors. |
| **FINRA / SEC**      | Non-Repudiation & Security | Strict field-level encryption on the `CheckpointStore` database rows coupled with multi-tenant budget boundaries. |

## Elite Compliance Requirements

To achieve elite-tier readiness for highly regulated enterprise environments—such as **US Federal (FedRAMP High), Global Banking (Basel III), or Sovereign Cloud deployments**—your plan must address the most rigid operational, cryptographic, and sovereignty constraints.

The final checklist items to make your Backstage agent core plugin fully compliant in these environments include:

### Cryptographic and Model Sovereignty

- **FIPS 140-3 Compliance:** In US Federal and defense environments, all data encryption (both at-rest encryption in your `CheckpointStore` and in-transit TLS for your SSE streams) must strictly utilize **FIPS 140-3 validated cryptographic modules**. Standard Node.js `crypto` libraries must be configured to run exclusively in FIPS mode (`crypto.setFipsMode(true)` or via the underlying OpenSSL layer).
- **On-Premise / Air-Gapped Model Fallbacks:** Highly regulated environments often enforce **data residency laws** that legally forbid sending any data to external public LLM endpoints (like public OpenAI or Anthropic clouds). Your core `model maps` architecture must explicitly support routing to locally hosted, private models inside the corporate perimeter (e.g., vLLM or Ollama running inside a secure VPC, or private endpoints like Azure OpenAI / AWS Bedrock under a Business Associate Agreement).

### Network Isolation and Exfiltration Protections

- **Forward Proxy Whitelisting:** Regulated environments operate behind strict egress firewalls. Your plugin must support routing all outbound LLM API requests and webhook callbacks through an enterprise **forward proxy** (e.g., using `https-proxy-agent`).
- **Tool Outbound Control:** Your `ToolRegistry` must enforce network isolation for tools. If an LLM requests a tool to fetch information, that tool should have zero direct access to the wider internet; it must be bound to specific internal corporate subnets.

### Supply Chain Security and Code Execution

- **Ephemeral Sandboxing for Dynamic Content:** If your LangGraph agents generate code, write automated tests, or modify templates, **that code must be treated as untrusted and malicious**. You must guarantee that any verification steps (like running a generated linter or test suite) run in a dedicated, isolated, ephemeral micro-virtual machine (such as AWS Firecracker or Google gVisor) that has zero access to the primary Backstage cluster network or database layers.
- **Deterministic Artifact Signing:** When an agent successfully emits a platform output (e.g., a zip file, code bundle, or binary report) registered as a valid `artifactKind`, your plugin should cryptographically sign that artifact using an enterprise key management system (like Cosign or Sigstore). This guarantees that downstream deployments can verify the artifact was generated by a trusted, compliant agent execution path and has not been altered by an attacker.

### Continuous Operational Compliance

- **Maximum Lifecycle Expiration Gating:** In banking or federal systems, a process cannot sit paused indefinitely. If a `WorkflowInterrupt` is waiting for a human approval gate, your engine must enforce a **hard expiration timer** (e.g., auto-rejecting and archiving the run after 48 hours). This prevents stale authorization states from being exploited later.
- **Four-Eyes Principle (Dual Authorization):** For critical infrastructure mutations (such as deploying an internal service or modifying user permissions), your core engine should support a dual-authorization rule in the `WorkflowInterrupt` logic. This forces two distinct, authenticated corporate `UserRef` identities to approve the state transition before the LangGraph engine resumes execution.

## Agent Conversations

We've had discussions in chat on a number of features. We will implement these, in a separate step from the above error handling and audit issues:

- Adding a dedicated Postgres `usage` table to support org-wide spend/token/efficiency tracking across runs.
- A dedicated monitoring plugin.
- A configurable `RedactionPolicy` so that end users can control their own redaction keys.
- Dropping BaseLLM. This item is complex and requires further investigation. The issue is that there are other model interfaces we probably should support like Speech-to-Text / Transcription Models, Text-to-Speech (TTS) Models, Reranking Models, and Cross-Encoders and Text Classifiers, in addition to `BaseChatModel`.
- We currently have "No Multi-Tenancy" as an out of scope item. I do understand the implications of adding multi-tenancy, and also that it's listed in the enterprise requirements; I'd like to explore what implementing it would involve.
- We'll add provider ID unions in core-node types.
- We'll add per-plugin provider restriction capability via a new policy field on `AgentDefinition`, enforced in the refactor's `ToolExecutor` - for one enforcement point, no per-plugin plumbing.
