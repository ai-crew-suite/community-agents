# Kubernetes AI Responder Implementation Plan

## Overview

This plugin interfaces with your active Kubernetes infrastructure to parse error states, investigate pod logs, and serve real-time remediation playbooks.

- **The Task:** Providing a "likely cause" summary when a service fails.
- **The Logic:** An agent monitors [Kubernetes](https://medium.com/@naeemulhaq/architecting-an-internal-developer-platform-idp-with-backstage-and-kubernetes-9ec6311d866d) status in Backstage and, upon failure, gathers logs, traces, and recent PRs to build a root-cause hypothesis.

## Goal

Implement `@ai-crew-suite/plugin-agent-kubernetes-responder-backend` as a backend module that turns an authenticated incident trigger into a bounded, auditable Kubernetes investigation. The workflow produces a cited likely-cause summary and recommended next steps. It does not mutate Kubernetes, repositories, or third-party systems in the first release.

The plugin must work through AI Crew Suite's stable tool contracts instead of calling Kubernetes, GitHub, Datadog, or Backstage frontend routes directly.

## Delivery Boundary

### In scope

- Accept an authenticated incident trigger by webhook and, later, an optional scheduler poll.
- Resolve the affected catalog entity and Kubernetes workload.
- Branch deterministic investigation behavior for common Kubernetes failure signatures such as `OOMKilled`, `ImagePullBackOff`, crash loops, and failed rollouts.
- Gather bounded Kubernetes diagnostics, relevant VCS change context, observability evidence, catalog identity/context, and optional retrieval context.
- Run a LangGraph-style investigation workflow and persist run/checkpoint/audit state through the existing AI runtime.
- Produce a structured incident report plus streaming runtime events.
- Add a minimal frontend experience for triggering, following, and inspecting a responder run.
- Verify deterministic behavior locally and in CI with stateful fixtures; run an opt-in real-model evaluation suite with controlled spend.

### Explicitly out of scope for v1

- Kubernetes writes: restart, scale, rollout undo, delete, apply, exec, or shell access.
- Direct access to Kubernetes Secrets or ConfigMap values.
- Automatic notification, ticket creation, or remediation. These remain future approved workflow steps using communication, project-management, and any future write-capable Kubernetes contract.
- A generic replacement for the Backstage Kubernetes backend.

## Required Prerequisites

The responder must not be implemented against fictional service references such as `kubernetes.service` or `github.service`. It depends on the following real contracts.

| Capability | Required contract | Current state | Required action |
| --- | --- | --- | --- |
| Kubernetes workload, pod, logs, events, timeline | `KubernetesDiagnosticsDriver` and `kubernetes.*` tools | Contract, read-only tools, and module shell exist; the Backstage-aware diagnostics implementation is not present | Complete `plugin-ai-core-backend-module-kubernetes` before enabling the responder in the app backend.  |
| Source changes and pull requests  | VCS tools, preferably `vcs.repository.read_file` and `vcs.pull_request.list` | Provider group exists | Define a catalog-to-repository resolver and retain only relevant commits/PRs inside the incident window. |
| Traces, logs, metrics, dashboards | `observability.*` tools | Datadog driver exists  | Define a fixed evidence query budget and require graceful degradation when observability is not configured.  |
| Incident context | `incident.*` tools | PagerDuty driver exists | Correlate trigger IDs and timestamps; do not require PagerDuty for webhook-triggered runs. |
| Semantic runbook/document context | `knowledge.retrieve`  | Exists  | Pass entity and incident filters where supported; cap result count. |
| Stateful run, SSE, approval/audit  | AI Core run controller and runtime stores | Exists | Use existing `/agents/:id/runs`, run event stream, persisted events, and checkpoint APIs. |
| Domain-specific workflow execution | Workflow-runner extension and shared executor | Not sufficient today | Add reusable workflow-runner registration and controlled tool/model execution before the responder. The current `LangGraphOrchestrator` calls only `knowledge.retrieve` and cannot host an agent-defined investigation graph. |

The runtime extension is a hard gate. Merely listing `toolIds` in an
`AgentDefinition` is not enough until a controlled executor can invoke those
tools and expose each invocation as an auditable event. This is shared work in
`plugin-ai-core-backend` and `plugin-ai-core-node`, not responder-specific
behavior.

Do not turn `LangGraphOrchestrator` into a central switch statement containing
Kubernetes, RFC, release-note, or documentation-specific branches. It is
currently a concrete generic retrieval-and-chat workflow. Preserve it as that
default workflow, while allowing domain plugins to register their own graph
runners through a shared workflow-runner extension point.

## Package Shape

Create the package from the normal backend-module template:

```text
plugins/backend/plugin-ai-agent-backend-kubernetes-ai-responder/
  package.json
  tsconfig.json
  config.d.ts
  README.md
  src/
    index.ts
    module.ts
    agent.ts
    config.ts
    workflow/
      IncidentTriageGraph.ts
      state.ts
      routing.ts
      evidence.ts
      report.ts
    triggers/
      webhook.ts
      scheduler.ts
      normalizeAlert.ts
    services/
      CatalogContextResolver.ts
      InvestigationToolRunner.ts
      ReportArtifactWriter.ts
    testUtils/
      scenarioBuilder.ts
      fakeClock.ts
      assertionHelpers.ts
    __tests__/
    workflow/__tests__/
    triggers/__tests__/
    services/__tests__/
```

Use `createBackendModule` with `pluginId: 'ai-core'` and a stable module ID such as `agent-kubernetes-ai-responder`. Register the agent through `agentExtensionPoint`; do not add another bespoke HTTP server. If the current AI Core controller requires route additions for trigger metadata, add them to the shared controller/router with a generic trigger payload model rather than a responder-only endpoint.

## Shared AI-Core APIs To Build First

Do not defer known common behavior until multiple workflow plugins duplicate it. The planned plugin corpus already establishes reuse for catalog identity, Scaffolder workflow control, and TechDocs source discovery.

### 1. Catalog semantic helpers

Add a small, dependency-injected library in `plugin-ai-core-node`, for example `src/catalog/`, not a catalog proxy backend plugin.

```ts
export interface CatalogEntityResolver {
  getEntitySummary(
    entityRef: string,
  ): Promise<CatalogEntitySummary | undefined>;
  findByAnnotation(input: {
    annotation: string;
    value: string;
    kinds?: string[];
    limit?: number;
  }): Promise<CatalogEntitySummary[]>;
  getRelations(input: {
    entityRef: string;
    relationTypes: string[];
    maxDepth: number;
    limit: number;
  }): Promise<CatalogRelationGraph>;
  getIntegrationReferences(entityRef: string): Promise<{
    kubernetesIds: string[];
    repositories: string[];
    owners: string[];
    techdocsRef?: string;
  }>;
}
```

Implement the adapter in the responder initially using `catalogServiceRef`, but keep the interface and pure mapping in `plugin-ai-core-node`. This is known to be shared by `catalog-ai-insights`, `rfc-adr-ai-reviewer`, `scaffolder-ai-drift-detector`, `scaffolder-ai-intent`, `scaffolder-ai-shadow-detective`, `search-ai-archeology`, `search-ai-context`, `tech-debt-ai-scout`, and `tech-radar-ai-manager`.

Requirements:

- Preserve entity references, annotations, ownership, lifecycle, type, and relation direction.
- Explicitly bound relation depth and total entities.
- Return compact serializable summaries, not arbitrary raw catalog entities.
- Perform permission-aware catalog access with the initiating identity.
- Unit-test mapping and relation traversal independently of any agent.

### 2. Scaffolder semantic helpers

Add `plugin-ai-core-node/src/scaffolder/` when implementing the first Scaffolder-consuming workflow. The requirements are already known from `scaffolder-ai-guardrail-agent`, `scaffolder-ai-infra`, `scaffolder-ai-intent`, `scaffolder-ai-prd`, and `scaffolder-ai-shadow-detective`.

```ts
export interface ScaffolderWorkflowService {
  listTemplates(input: TemplateQuery): Promise<TemplateSummary[]>;
  validateTemplateParameters(
    input: TemplateValidationRequest,
  ): Promise<TemplateValidationResult>;
  createTaskDraft(input: TemplateTaskDraft): Promise<TemplateTaskDraftResult>;
  getTaskSummary(taskId: string): Promise<TemplateTaskSummary>;
}
```

V1 responder does not need to call this API. Build the contract and tests in the first Scaffolder workflow package, before that workflow directly consumes Scaffolder internals. Do not expose unapproved task execution as an agent tool.

### 3. TechDocs and documentation-source helpers

`UrlReader` should remain the direct, integration-aware source reader. Add only shared semantic normalization in `plugin-ai-core-node/src/docs/`:

```ts
export interface DocumentationSourceResolver {
  resolveForEntity(
    entityRef: string,
  ): Promise<DocumentationSourceSummary | undefined>;
  readBounded(input: {
    url: string;
    maxBytes: number;
    contentType?: 'markdown' | 'text';
  }): Promise<DocumentationExcerpt>;
}
```

The implementation uses catalog metadata to find TechDocs/source locations and `UrlReader` to read them. Repository writes remain VCS operations. This is known to be shared by `scaffolder-ai-prd`, `techdocs-ai-janitor`, `techdocs-ai-postmortem`, `search-ai-archeology`, and related documentation workflows.

### 4. Investigation evidence contract

Add responder-specific pure types in the responder package first. Promote only reused pieces to `plugin-ai-core-node` after the incident/postmortem/handover workflows agree on the shape.

```ts
type EvidenceItem = {
  source:
    | 'kubernetes'
    | 'vcs'
    | 'observability'
    | 'incident-management'
    | 'knowledge';
  kind: string;
  observedAt?: string;
  summary: string;
  reference?: string;
  confidence?: 'high' | 'medium' | 'low';
};

type IncidentTriageReport = {
  incidentId: string;
  entityRef?: string;
  status: 'investigated' | 'insufficient_evidence' | 'failed';
  likelyCauses: { summary: string; confidence: number; evidence: string[] }[];
  timeline: EvidenceItem[];
  recommendedNextSteps: string[];
  limitations: string[];
};
```

Every LLM claim in the final report must cite one or more retained evidence item references. The model must be instructed to say `insufficient evidence` rather than infer a cause not supported by the evidence bundle.

## Runtime Extension Plan

### Reusable workflow-runner architecture

This section is the exemplar for future agentic workflow implementation plans.
Separate **shared execution mechanics** from **domain workflow decisions**.

| Owned by AI Core                                                                                                              | Owned by the workflow plugin                                            |
| ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Runner registration and resolution                                                                                            | Graph topology and state transitions                                    |
| Tool allow-list enforcement                                                                                                   | Which allowed tool is called next and why                               |
| Tool lookup, identity propagation, cancellation, timeout, retry, and call budgets                                             | Domain input validation and evidence-selection policy                   |
| Model resolution, token accounting, and hardening limits                                                                      | Domain prompt, structured report schema, and citation rules             |
| Uniform tool/start/result/error events, artifact references, run persistence, audit, checkpoints, replay, and approval policy | Domain-specific step names, evidence mapping, and report interpretation |

The general rule is:

> Centralize how any workflow safely invokes a tool or model. Keep why a
> particular workflow investigates, routes, or summarizes in that workflow's
> package.

### New AI Core extension point

Add a workflow-runner contract in `plugin-ai-core-node` and an extension point
in `plugin-ai-core-backend`:

```ts
export interface WorkflowRunner {
  readonly id: string;
  run(
    input: WorkflowRunInput,
    context: WorkflowContext,
  ): AsyncIterable<AgentEvent>;
  resume?(
    input: WorkflowResumeInput,
    context: WorkflowContext,
  ): AsyncIterable<AgentEvent>;
}

export interface WorkflowRunnerExtensionPoint {
  registerRunner(runner: WorkflowRunner): void;
}
```

The contract must bind a runner to an agent ID or an explicit workflow ID. Agent
definitions select the runner through a new optional field such as
`workflowRef`; they do not overload `orchestrator: 'langgraph'` to mean a
Kubernetes-specific graph. `LangGraphOrchestrator` remains the built-in generic
retrieval-and-chat runner for agents that do not supply `workflowRef`.

The responder package registers `kubernetes-incident-triage` through this
extension point. A future RFC reviewer, release-notes generator, or TechDocs
janitor can register its own runner without editing AI Core orchestration code.

### Shared execution services

Provide workflow runners a context assembled by AI Core, not direct access to
the raw `ToolRegistry` or model maps:

```ts
export interface ToolExecutor {
  invoke<TArgs, TResult>(input: {
    toolId: string;
    args: TArgs;
    run: WorkflowRunContext;
    limits?: ToolInvocationLimits;
  }): Promise<ToolInvocationResult<TResult>>;
}

export interface ModelExecutor {
  stream(input: ModelInvocation): AsyncIterable<ModelInvocationEvent>;
}

export interface WorkflowContext {
  run: WorkflowRunContext;
  tools: ToolExecutor;
  model: ModelExecutor;
  events: WorkflowEventSink;
  artifacts: ArtifactWriter;
  checkpoints: CheckpointStore;
}
```

`ToolExecutor` is the sole path for workflow tool calls. It must:

1. Verify that `toolId` appears in the selected agent's `toolIds` allow-list.
2. Pass the initiating identity, credentials/auth helpers when available, run
   ID, scoped logger, and abort signal to the tool.
3. Enforce per-tool timeout, retry classification, invocation-count limits, and
   evidence-byte limits.
4. Emit ordered `tool.start`, `tool.result`, and `tool.error` events with
   redacted summaries only.
5. Persist tool-call metadata, artifact references, and audit entries without
   storing raw sensitive payloads by default.
6. Apply approval policy from a tool's declared `effect`; read tools do not
   pause for approval, while future write tools do.

`ModelExecutor` resolves the agent's registered `modelRef` from the existing
model registry. It remains provider-neutral: AWS Bedrock, OpenAI, OpenRouter,
and future provider modules all satisfy the same model invocation contract.

### Runtime integration

Update `AgentRuntime` to resolve a registered workflow runner for an agent with
`workflowRef`, and otherwise retain current orchestrator selection. It owns run
lifecycle, retries, token budgets, run/event persistence, SSE replay, and
approval resumption regardless of the selected runner.

Update the controller/factory validation path to fail startup when:

- an agent references an unknown workflow runner;
- a workflow's declared required tool is absent from the agent allow-list;
- a workflow references an unknown model ID; or
- the configured runner cannot support a requested resume/approval path.

### Requirements for every future workflow plan

Every future agentic workflow implementation plan should explicitly state:

1. The registered `workflowRef` and runner package.
2. Its graph nodes, deterministic routing conditions, state schema, and resume
   behavior.
3. Its exact tool allow-list and which node invokes each tool.
4. Evidence caps, redaction behavior, retry/timeout policy, and cancellation
   behavior.
5. Its report/output schema and evidence-citation rules.
6. Whether the workflow has any write tool and the approval/audit path for it.
7. Unit, stateful integration, real-model evaluation, and browser E2E coverage.

### Responder-specific use of the shared services

The responder's `IncidentTriageGraph` calls a narrow
`InvestigationToolRunner` built on `ToolExecutor`; it does not let the model
autonomously select unrestricted external calls. Its graph routing remains
deterministic. The model receives the normalized bounded evidence bundle only to
synthesize a cited report.

## Responder Workflow

### Input normalization

Support a versioned trigger payload model:

```ts
type KubernetesIncidentTrigger = {
  version: 1;
  source:
    | 'alertmanager'
    | 'datadog'
    | 'pagerduty'
    | 'prometheus'
    | 'manual'
    | 'scheduler';
  occurredAt: string;
  entityRef?: string;
  cluster?: string;
  namespace?: string;
  workload?: string;
  pod?: string;
  alertId?: string;
  severity?: string;
  summary: string;
  labels?: Record<string, string>;
};
```

Validate timestamps, reject oversized labels/payloads, correlate the trigger to a catalog entity where possible, and record the original normalized trigger as a redacted run artifact.

### Deterministic graph nodes

1. **Validate and correlate**: authenticate trigger caller; validate schema; resolve entity/workload; establish the incident time window.
2. **Kubernetes snapshot**: fetch workload and pod snapshots; retain only relevant containers, conditions, events, and bounded logs.
3. **Route by failure class**:
   - `OOMKilled`, memory pressure, or repeated restarts: gather previous logs, resource/limit evidence, traces, and recent configuration or code changes.
   - `ImagePullBackOff` or image errors: gather events, image references, deployment/ReplicaSet timeline, and recent VCS changes. Do not expose registry credentials.
   - rollout deadline or unavailable replicas: gather rollout conditions, ReplicaSets, events, traces, and recent commits/PRs.
   - unknown: gather a bounded baseline evidence set and report uncertainty.
4. **Cross-source evidence**: query observability and VCS only with bounded windows tied to the trigger; optionally retrieve runbook context.
5. **Evidence normalization**: deduplicate, sort by observation time, redact, cap the bundle, and persist a stable artifact reference.
6. **LLM synthesis**: call the configured model with the evidence bundle and a strict output schema. Require citations to evidence IDs and explicit limitations.
7. **Finalize**: validate report schema, persist report artifact/audit entries, emit a terminal run event, and make the result retrievable by run ID.

### Model configuration

The agent uses an installation-configured registered model ID, never a provider
name, API key, endpoint, or provider SDK in plugin code. Its `modelRef` resolves
through the existing `modelExtensionPoint` registry. An installation may register
that ID through the chat-model module appropriate for its environment, including
AWS Bedrock, OpenAI, OpenRouter, or a future provider module.

The responder package declares a configurable model reference under its own
configuration, for example:

```yaml
ai:
  agents:
    kubernetes-ai-responder:
      model: incident-triage
```

`incident-triage` is an installation-local registry ID. The administrator maps
it to a provider in installation configuration and supplies credentials through
that provider module's normal secret mechanism.

Initial agent definition:

```ts
{
  id: 'kubernetes-ai-responder',
  modelRef: 'incident-triage',
  orchestrator: 'langgraph',
  memory: 'session',
  toolIds: [
    'kubernetes.workload.resolve',
    'kubernetes.workload.get_snapshot',
    'kubernetes.pod.get_snapshot',
    'kubernetes.pod.get_logs',
    'kubernetes.workload.list_events',
    'kubernetes.workload.get_timeline',
    'vcs.pull_request.list',
    'observability.logs.search',
    'observability.traces.search',
    'knowledge.retrieve',
  ],
}
```

The exact VCS and observability IDs must be checked against the registered tool catalog before the agent is added. Keep the allow-list minimal; add incident management context only when an incident ID is available.

## Kubernetes Diagnostics Module Gate

`plugin-ai-core-backend-module-kubernetes` is the single Backstage-native adapter. It is not a core-plus-provider family and does not require a `-backstage` satellite package. Complete that existing module with its Backstage-aware diagnostics implementation, then load it in `packages/backend` alongside `@backstage/plugin-kubernetes-backend`.

The implementation must use the configured Backstage Kubernetes integration for entity/service location, cluster selection, credentials, authorization, and object retrieval. It must not reconstruct raw `KubeConfig` objects from root configuration. It must enforce:

- maximum log lines and bytes;
- maximum events, pods, workload snapshots, and timeline span;
- redaction of credential-like strings and sensitive annotation values;
- no Secret values, ConfigMap data, `exec`, proxy, or write endpoints;
- cancellation and per-call timeouts from `ToolContext.signal`.

Before adding the diagnostics operations, simplify the current module around its
single-adapter responsibility:

1. Remove `ai.integrations.kubernetes.provider` and its provider-selector config.
2. Remove the internal diagnostics driver registry and `kubernetesDiagnosticsDriversExtensionPoint`; there is no alternate provider to select in this design.
3. Retain the normalized Kubernetes diagnostics types and stable
   `kubernetes.*` tools in `plugin-ai-core-node`.
4. Construct the Backstage-aware diagnostics service inside the existing module and pass it directly to `createKubernetesDiagnosticsTools`.

Its tests must exercise the actual Backstage Kubernetes extension/configuration
path with fixture catalog, cluster, authentication, and fetcher implementations;
they must not use a fictitious `kubernetes.service` reference.

## Frontend Plan

Create a companion frontend plugin only after the backend can execute a fully mocked responder run:

```text
plugins/frontend/plugin-ai-kubernetes-ai-responder/
  src/
    plugin.ts
    api.ts
    components/
      IncidentTriagePage.tsx
      TriggerIncidentDialog.tsx
      RunTimeline.tsx
      EvidencePanel.tsx
      ReportPanel.tsx
      RunStatusBanner.tsx
    routes.ts
    __tests__/
```

### Frontend responsibilities

- Provide an incident triage page and catalog-entity context action.
- Allow a permitted user to start a **manual read-only investigation** by entity reference or workload coordinates.
- Subscribe to the existing AI Core SSE endpoint `/agents/:id/runs/:runId/events` after starting a run.
- Show graph-node progress, redacted evidence summaries, final report, limitations, and artifact references.
- Preserve a deep link to the run ID and recover event history on reload using the existing run event endpoint.
- Clearly label all evidence as observed data or model inference. Do not render raw unbounded log content.
- Do not include remediation buttons in v1.

### Frontend tests

- Component tests with mocked AI Core API responses for loading, SSE progress, terminal report, tool failure, insufficient evidence, and reconnect/replay.
- Accessibility checks for live status updates, keyboard access, and error states.
- Playwright visual and interaction tests against the actual app/backend fixture environment. Capture screenshots on both a completed OOM scenario and an insufficient-evidence scenario.

## Test and Evaluation Strategy

Testing must verify behavior across time, not only static request/response fixtures. Every scenario is a state machine: trigger arrives, external evidence changes, graph progresses, evidence is persisted, and a person sees the result.

### Test layers

| Layer               | What it proves                                                                                                | Network policy                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Unit                | Payload validation, routing, redaction, time-window calculation, evidence mapping, report schema validation   | No network; fake clock and typed fakes.                                    |
| Contract            | Each adapter maps representative provider responses into stable tool contracts                                | No public network; fixture JSON and HTTP request assertions.               |
| Backend integration | Module registration, identity propagation, trigger route, SSE order, checkpoints, run/event/audit persistence | `startTestBackend`, in-memory SQLite/mock services, stateful fake drivers. |
| Runtime integration | AI Core invokes the responder graph and allowed tools with the correct context                                | Local fake model by default; no provider network.                          |
| LLM evaluation      | A real installation-configured model produces grounded reports from fixed evidence bundles                    | Opt-in, secret-gated, budget-capped, recorded metadata.                    |
| Full-stack E2E      | Built Backstage frontend and backend show an investigation progressing and completing                         | Local fixture backend, Playwright, no third-party network.                 |

### Stateful scenario fixtures

Create a reusable fixture package only after extracting it from this responder and the next workflow, or create responder-local fixtures first under `src/testUtils/`. Fixtures must be immutable event sequences with a controllable clock, not mutable ad hoc mocks.

```ts
type ScenarioStep = {
  at: string;
  source: 'trigger' | 'kubernetes' | 'vcs' | 'observability' | 'user';
  operation: string;
  response?: unknown;
  error?: { code: string; message: string };
};

type IncidentScenario = {
  id: string;
  initialCatalog: CatalogEntity[];
  steps: ScenarioStep[];
  expected: {
    graphNodes: string[];
    toolCalls: string[];
    reportAssertions: ReportExpectation[];
  };
};
```

The fake driver advances only when the test clock reaches the next step. This models facts arriving after the initial trigger: a pod restarting, a rollout condition changing, an event appearing, a trace completing, or a human approval arriving. Tests must assert event ordering and final persisted state after every step.

Required initial scenario matrix:

1. **OOMKilled with a recent memory-limit PR**: prior logs, restart count, resource evidence, trace degradation, and matching PR arrive over time.
2. **ImagePullBackOff**: image pull events and deployment revision evidence; no registry secrets in evidence or SSE output.
3. **ProgressDeadlineExceeded**: failed rollout, unavailable replicas, and bounded event timeline.
4. **Transient recovery**: an initial crash recovers before investigation ends; report must distinguish recovered state from root cause certainty.
5. **Ambiguous incident**: Kubernetes and observability disagree; report must return insufficient evidence rather than a fabricated cause.
6. **Unauthorized entity or cluster**: no external diagnostic calls occur after authorization denial.
7. **Adapter timeout/error**: graph emits a scoped failure/limitation and still produces a partial report from remaining evidence.
8. **Cancelled run**: abort signal stops further tool calls and records a cancelled terminal state.
9. **Event replay**: reconnect after a simulated frontend disconnect and verify `Last-Event-ID` replays the same ordered run events without duplication.
10. **Future approval path**: checkpoint and resume behavior is tested with a synthetic write proposal, while production v1 exposes no write tool.

### LLM testing with an installation-configured provider

Use two modes; never make public-model availability a requirement for the normal test suite.

**Deterministic mode** runs in CI on every change:

- Replace the chat model with a scripted fake that emits schema-valid and intentionally invalid outputs.
- Assert tool calls, graph routes, citations, evidence truncation, persistence, and SSE events exactly.
- Validate final reports with a JSON schema before they reach the UI.

**Real-model evaluation mode** is opt-in and provider-neutral:

```bash
AI_EVAL_MODEL_REF=incident-triage \
AI_EVAL_CONFIG=app-config.eval.yaml \
yarn test:eval:kubernetes-ai-responder
```

Implement it as a separate script and test suite with these controls:

- Skip when `AI_EVAL_MODEL_REF` is absent or does not resolve from the model
  registry assembled by the evaluation configuration.
- Use a fixed set of redacted, synthetic evidence bundles only.
- Set deterministic sampling as far as the model supports it: low temperature, bounded output tokens, request timeout, retry policy, and a per-run budget.
- Persist resolved model registry ID, provider/model metadata when exposed,
  request ID when exposed, prompt/evidence fixture IDs, latency, token use, and
  response artifact; never persist provider credentials.
- Grade outputs structurally: valid schema, evidence citations point to supplied IDs, no unsupported external facts, explicit uncertainty for ambiguous cases, and no secret-like values.
- Use judge-model evaluation only as a secondary signal. Deterministic rubric graders remain the merge gate.
- Mark results as nondeterministic telemetry, not a pass/fail replacement for unit/integration tests.

### Adapter contract fixtures

Each provider adapter owns fixture transcripts that reflect the real API shape:

- Kubernetes Backstage driver: catalog-to-workload resolution, pods, events, rollout conditions, log truncation/redaction, denied access, and timeout.
- VCS: repository metadata, pull requests, empty history, pagination, and provider failure.
- Observability: trace/log result, delayed data, empty result, rate limit, and partial outage.
- Incident management: alert trigger correlation and unavailable provider.

Fixtures must test time evolution, not only a single complete response. Store synthetic sanitized JSON/HTTP fixtures in the owning package and validate them against runtime schemas.

## Real Backstage Instance and E2E Environment

The repository already has `packages/app`, `packages/backend`, and Playwright configuration that starts `yarn start` and `yarn start-backend`. Make them a first-class verification environment rather than relying only on isolated tests.

### Local fixture profile

Create a checked-in, non-secret development config profile, for example:

```text
app-config.e2e.yaml
packages/backend/e2e-fixtures/
  catalog.yaml
  scenarios/
    oom-killed.json
    image-pull-backoff.json
  mock-adapters/
```

The profile must:

- Seed catalog entities with Kubernetes, repository, owner, and TechDocs annotations.
- Load the Kubernetes diagnostics core plus a fixture diagnostics driver with `provider: fixture`.
- Load fixture VCS, observability, incident-management, and model registrations that do not call external services.
- Configure a local database/runtime-store suitable for run persistence and event replay.
- Register the responder agent and frontend plugin.
- Disable all real outgoing provider requests in fixture mode; fail tests if a non-local URL is requested.

Add dedicated root scripts such as:

```text
yarn dev:e2e-fixture
yarn test:e2e:kubernetes-ai-responder
yarn test:eval:kubernetes-ai-responder
```

Do not overload the normal `yarn start` profile with synthetic production-like fixtures. Normal local development and fixture E2E must remain explicit modes.

### Backend E2E tests

Use `startTestBackend` for fast integration tests and the real `packages/backend` process for one or more black-box tests.

For the black-box suite:

1. Start the backend with `app-config.e2e.yaml` and the fixture modules.
2. POST an authenticated synthetic alert to the responder trigger route or the generic AI Core trigger route.
3. Open the SSE run-event endpoint and assert ordered event types: accepted, graph steps, tool/evidence summaries, report artifact, done.
4. Query persisted run/event/approval state through supported API endpoints or test-only database assertions.
5. Advance the fixture clock and assert later Kubernetes/events/VCS data changes the graph evidence as expected.
6. Verify no non-local HTTP requests and no unredacted sensitive values appear in SSE, artifacts, logs, or the database.

### Browser E2E and visual review

Extend the existing Playwright suite under `packages/app/e2e-tests/`:

1. Start the app and backend against the E2E fixture profile.
2. Open the responder page or catalog-entity action for `payment-gateway`.
3. Start the OOM scenario and wait for terminal SSE-driven UI state.
4. Assert visible status, failure signature, cited evidence, limitation state, and deep-linkable run ID.
5. Reload during a run and verify event replay reaches the same final report.
6. Run at desktop and mobile viewport sizes; capture deterministic screenshots for completed and insufficient-evidence scenarios.
7. Review Playwright HTML report, trace, console errors, network failures, and screenshots as CI artifacts. The visual inspection is a required human release step for UI changes, not merely a screenshot existence check.

Use `page.route` only to fail unexpected external browser requests. The actual scenario data must come from the local backend fixture path so the browser test exercises the real UI-to-backend-to-runtime route.

## Security and Operational Guardrails

- Authenticate webhook sources and verify signatures before creating a run.
- Associate every trigger/run/tool call with the initiating identity or an explicit service principal.
- Enforce authorization before catalog, Kubernetes, VCS, and observability data access.
- Redact logs before they enter model context, SSE events, artifacts, audit records, or test snapshots.
- Cap tool calls, evidence items, log bytes, event counts, lookback windows, tokens, retries, and wall-clock run duration.
- Apply correlation IDs: trigger ID, run ID, entity ref, incident ID, cluster, namespace, workload, and tool invocation sequence.
- Generate no write-capable action in v1. A future remediation proposal must be an artifact that requires an explicit human approval and a separate write-capable tool contract.

## Ordered Implementation Milestones

### Milestone 0: Close architecture gates

- [ ] Complete `plugin-ai-core-backend-module-kubernetes` with its
      Backstage-aware diagnostics implementation and load it in `packages/backend`.
- [ ] Remove the Kubernetes provider selector and diagnostics-driver registry
      from that module; retain its normalized types and stable tools.
- [ ] Add the workflow-runner extension point, `ToolExecutor`, `ModelExecutor`,
      and generic event/audit/checkpoint integration in AI Core.
- [ ] Update `AgentRuntime` and configuration validation to resolve
      agent-specific `workflowRef` runners while retaining the built-in generic
      LangGraph workflow as the default.
- [ ] Define responder configuration schema, trigger schema, report schema, and evidence schema.
- [ ] Define catalog semantic helper interfaces in `plugin-ai-core-node` and implement the minimal adapter needed by the responder.
- [ ] Add fixture mode boundaries and block external HTTP in test mode.

Exit criteria: a local test boots the Kubernetes diagnostics module with fixture Backstage Kubernetes integration components, invokes a controlled tool plan, and receives auditable tool events.

### Milestone 1: Read-only responder backend

- [x] Scaffold package, register `kubernetes-ai-responder` agent, and implement configuration parsing.
- [x] Implement trigger normalization, authentication, and generic trigger binding.
- [x] Implement deterministic graph routing and bounded evidence collection.
- [x] Implement report schema validation, persistence, SSE output, and artifact references.
- [x] Add unit, contract, backend integration, and stateful scenario tests.

Exit criteria: all required scenario fixtures pass without a real LLM or third-party service.

### Milestone 2: Real-model evaluation

- [ ] Add the secret-gated, installation-model evaluation suite and deterministic rubric graders.
- [ ] Establish a baseline report-quality score for every scenario.
- [ ] Record evaluation metadata and spending/token guardrails.
- [ ] Add a manual review checklist for any model/prompt change.

Exit criteria: evaluation reports are grounded, schema-valid, and do not leak fixture-sensitive strings across the required scenario set.

### Milestone 3: Frontend and full-stack E2E

- [ ] Implement the frontend plugin, route, catalog context action, run stream, replay, report, and error states.
- [ ] Build `app-config.e2e.yaml`, fixture backend composition, and Playwright responder scenarios.
- [ ] Add visual review artifacts and CI retention for screenshots/traces.

Exit criteria: a local `yarn test:e2e:kubernetes-ai-responder` starts the real Backstage app/backend fixture environment and demonstrates a complete responder run in a browser without external infrastructure.

### Milestone 4: Production readiness

- [ ] Document real Kubernetes Backstage configuration, webhook authentication,
      provider-specific model setup, responder model registration, runtime
      persistence, and observability configuration.
- [ ] Add operational dashboards/alerts for failed runs, provider timeout rate, redaction events, model cost, and webhook verification failures.
- [ ] Run a controlled staging exercise with a real Kubernetes cluster and read-only credentials before enabling production triggers.

Exit criteria: deployment has explicit rollback controls, run auditing, bounded costs, and a verified staging incident investigation.

## Definition of Done

The responder is complete only when:

- Its package, agent registration, configuration schema, and read-only tool allow-list are implemented.
- It runs through the real AI Core controller/runtime and persists/replays run events and artifacts.
- Every required stateful scenario passes deterministically.
- The optional installation-model evaluation suite passes its structural grounding and safety graders within budget.
- The fixture app/backend starts from a clean checkout and Playwright verifies a visible, replayable investigation run.
- No fixture, unit, backend, browser, or evaluation output contains raw secret values, unbounded logs, or unauthorized Kubernetes data.

## Frontend Implementation Completion Notes

All validated and green. The two extra untracked files (`copilot-instructions.md`, `frontend-app.instructions.md`) are __empty placeholders__ — not mine, and not part of this task. My earlier `plugin-registration.md` is confirmed tracked/committed.

I implemented `@ai-crew-suite/plugin-agent-kubernetes-responder` per the Frontend Plan, fully registered and green.

### New plugin: `plugins/frontend/plugin-ai-agent-frontend-kubernetes-ai-responder/` (26 files)

__API layer (SSE over AI Core)__

- `api/client.ts` — `KubernetesAiResponderClient`: `startInvestigation()` (POST `/agents/kubernetes-ai-responder/runs`, JSON-encodes the trigger) and `streamRunEvents()` (GET `/runs/:runId/events` with `Last-Event-ID` replay), parsing the SSE stream via `eventsource-parser`. Uses `discoveryApi.getBaseUrl('ai-core')` + Bearer token.
- `api/apiRef.ts`, `api/index.ts`; `@types/index.ts` — self-contained wire types (the backend package isn't isomorphic, so it can't be imported into a frontend bundle).

__Run state__ — `hooks/useIncidentRun.ts`: a pure exported `reduceIncidentRun` reducer folds the event stream into render-ready state (steps, tool events, report from the `incident-triage-report` artifact, error/phase), plus the `useIncidentRun` hook (`start`/`resume`/`reset`).

__Components__ — `IncidentTriagePage` (orchestrates run lifecycle + deep-link via `?run=<id>` and dialog prefill via `?entityRef=<ref>`), `TriggerIncidentDialog` (entity-ref __or__ workload-coordinates form), `RunTimeline` (graph-node + tool progress), `EvidencePanel` (labeled __observed data__, bounded summaries only), `ReportPanel` (likely causes labeled __model inference__ with citations, next steps, limitations), `RunStatusBanner` (live `role="status"`/`aria-live` updates), `IncidentActionButton` (catalog-entity context action linking to the prefilled page). No remediation actions (v1).

__Plugin wiring__ — classic `createPlugin` + `createRoutableExtension` (`plugin.ts`), and the new-frontend-system `/alpha` (`extensions/api.ts`, `extensions/components.ts`, `alpha.ts`) matching the `ai-crew-suite` pattern.

__Tests (22, all passing)__ — `useIncidentRun.test.ts` (pure reducer: progress, report extraction, tool failure, insufficient-evidence, error, replay), `panels.test.tsx` + `RunStatusBanner.test.tsx` (labeling, states, a11y roles), `IncidentTriagePage.test.tsx` (full flow via `renderInTestApp` + mocked API: manual run, deep-link replay, error state). Plus `dev/index.tsx` dev app.

### Registered in shared configs (per the plugin-registration rule)

- `tsconfig.json` → added the frontend reference → __typecheck 41/41__ ✅
- `.eslintrc.cjs` → added `scopedOverrides(..., 'frontend-plugin')` → __lint 41/41__ ✅

### Wired into the app

- `packages/app/package.json` dep + `App.tsx` `/alpha` feature registration; updated `App.test.tsx` (mock + expected feature list). Ran `yarn install` (lockfile updated).

### Notes / follow-ups

- The plan's Playwright E2E portion (Milestone 3: `app-config.e2e.yaml`, fixture backend, Playwright scenarios) is a separate, larger effort — out of scope here; the component + accessibility tests are in place.
- Frontend test files are excluded from the per-package `tsc --noEmit` (matching the existing `ai-crew-suite` convention) but are linted and run by the centralized vitest config.
- Tests emit a non-fatal React `act()` warning from the async SSE generator (state updates land outside `act`); green and stable, but I can wrap the stream consumption to silence it if you'd like.
- Two empty placeholder files (`.vscode/instructions/copilot-instructions.md`, `frontend-app.instructions.md`) exist untracked — not created by me and left untouched.
