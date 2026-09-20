# Catalog AI Insights Implementation Plan

## Overview

This plugin leverages large language models to analyze catalog entity relations and auto-generate structural engineering summaries.

- **The Task:** Answering contextual questions about any service in the Software Catalog (_"Who is the on-call?"_, _"Where are the logs?"_, _"Why did this service fail its last deployment?"_).
- **The Logic:** The backend plugin orchestrates a large language model (LLM) pipeline that retrieves a service's catalog metadata, deployment history, and monitoring metrics via Backstage service interfaces to compile unified natural language insights.

## Goal

Implement `@ai-crew-suite/plugin-agent-catalog-insights-backend` as an AI Core backend module that answers contextual operational questions about any Software Catalog entity (_"Who is the on-call?"_, _"Where are the logs?"_, _"Why did this service fail its last deployment?"_) through a RAG-backed, intent-routed workflow. A paired frontend plugin surfaces answers on the catalog entity page and in a standalone ask view.

Reuse the architecture proven by `plugin-ai-agent-backend-kubernetes-ai-responder` (its `_IMPLEMENTATION.md` remains the source of truth for repository conventions, workflow-runner mechanics, event contracts, and test-layer definitions). This plan documents only what differs: the RAG/aggregation shape, intent routing, vector-store integration, and background scheduling.

## Delivery Boundary

### In scope

- Answer a single natural-language question about one catalog entity per run, via the generic `/agents/catalog-ai-insights/runs` route.
- Deterministic intent routing (`ownership-oncall`, `observability-links`, `deployment-health`, `general-context`) before any model call.
- Bounded context aggregation over catalog metadata, on-call data, observability links/logs, Kubernetes deployment state, and recent PRs — all through registered AI Core tools.
- Entity-scoped RAG retrieval through the existing `knowledge.retrieve` tool and the pgvector-backed retrieval pipeline.
- A structured, citation-required `CatalogInsightReport` artifact plus streaming run events (same `AgentEvent` union as the responder).
- A nightly scheduled catalog scan producing proactive insight artifacts for unhealthy annotated services.
- A minimal frontend: entity-page insights card, ask dialog, live SSE run view, report/citations panels.

### Explicitly out of scope for v1

- Any write tool. `communication.message.post` (Slack dispatch of scan findings) is deferred to v1.1 behind approval policy and explicit config.
- Mutating catalog entities, Kubernetes, or third-party systems.
- Multi-entity/portfolio questions; one entity ref per run.
- A generic replacement for catalog search or the `knowledge.retrieve` contract itself.

## Required Prerequisites

Contracts verified against the current codebase. As with the responder plan: no fictional service refs — the foundation doc's `kubernetes.service` mock example must not be implemented; mock registered tools through the workflow context instead.

| Capability | Required contract | Current state | Required action |
| --- | --- | --- | --- |
| Semantic retrieval (RAG) | `knowledge.retrieve` tool + `DefaultRetrievalPipeline` | Exists (registered by AI Core factory; retrieval-augmenter + pgvector/qdrant modules) | Pass `entityFilter` scoped to the target entity; cap result count. |
| Catalog identity, annotations, relations | `CatalogEntityResolver` semantic helpers in `plugin-ai-core-node/src/catalog/` | **Not present** (declared shared work in the responder plan; this plugin is its first consumer) | Build the interface + pure mapping in `plugin-ai-core-node`; implement the `catalogServiceRef` adapter here. |
| On-call / incident context | `incident.oncall.get`, `incident.incident.list` | Exist (incident-management module, PagerDuty driver) | Degrade gracefully when no driver is configured. |
| Logs/dashboard links, log search | `observability.dashboard.list`, `observability.logs.search` | Exist (observability module, Datadog driver) | Fixed query budget; prefer links over raw log payloads. |
| Deployment health | `kubernetes.workload.resolve/get_snapshot/get_timeline/list_events`, `kubernetes.pod.get_snapshot` | Tools exist; Backstage-aware diagnostics implementation gated by responder Milestone 0 | Same gate as the responder; do not duplicate it here. |
| Recent change context | `vcs.pull_request.list` | Exists (VCS module) | Bounded lookback window, only for the `deployment-health` intent. |
| Stateful runs, SSE, artifacts | AI Core run controller + `workflowRunnerExtensionPoint` + runtime stores | Exist | Register runner `catalog-insights`; reuse `/agents/:id/runs` and event replay. |
| Scheduled headless runs | `coreServices.scheduler` + `coreServices.discovery` + `coreServices.auth` | Core services available; no AI Core scheduler abstraction | Schedule inside this module; start runs via authenticated plugin-to-plugin POST to the AI Core route. |

## Package Shape

Backend module from the same template as the responder; only the domain directories differ:

```text
plugins/backend/plugin-ai-agent-backend-catalog-ai-insights/
  package.json          # role: backend-plugin-module, pluginId: ai-core
  tsconfig.json
  config.d.ts
  README.md
  src/
    index.ts
    module.ts           # registers runner, agent, trigger, scheduler task
    agent.ts            # CATALOG_AI_INSIGHTS_AGENT_ID, tool allow-list, system prompt
    config.ts           # readCatalogAiInsightsConfig (ai.agents.catalogAiInsights)
    workflow/
      CatalogInsightsGraph.ts   # WorkflowRunner id 'catalog-insights'
      state.ts                  # InsightRunState
      intents.ts                # deterministic intent classification + routing table
      context.ts                # ContextItem normalization, dedupe, caps, redaction
      insight.ts                # CatalogInsightReport schema, validation, degradation
    retrieval/
      InsightRetriever.ts       # knowledge.retrieve wrapper: entityFilter, topK cap
      promptContext.ts          # context bundle -> model prompt assembly, citation rules
    scheduler/
      nightlyScan.ts            # coreServices.scheduler task registration
      scanPlanner.ts            # pure: entity list -> bounded scan plan
    services/
      CatalogContextResolver.ts # catalogServiceRef adapter behind CatalogEntityResolver
      InsightToolRunner.ts      # capped invokeTool facade (mirrors InvestigationToolRunner)
      InsightArtifactWriter.ts
    __tests__/
    workflow/__tests__/
    retrieval/__tests__/
    scheduler/__tests__/
    services/__tests__/
```

- `createBackendModule` with `pluginId: 'ai-core'`, `moduleId: 'agent-catalog-ai-insights'`.
- `module.ts` deps: `coreServices.rootConfig`, `logger`, `scheduler`, `discovery`, `auth`, `catalogServiceRef`, plus `agentExtensionPoint`, `triggerExtensionPoint`, `workflowRunnerExtensionPoint`.
- Package naming, scripts, Apache header, root `tsconfig.json` references, and `.eslintrc.cjs` role overrides follow the responder package and `plugin-registration.md` verbatim (not repeated here).

## Monorepo And App Wiring

Steps not covered by `plugin-registration.md` or any checked-in responder example — do not skip:

- **Backend module load**: add `"@ai-crew-suite/plugin-agent-catalog-insights-backend": "workspace:^"` to `packages/backend/package.json` and `backend.add(loadBackendFeature(import('@ai-crew-suite/plugin-agent-catalog-insights-backend')))` in `packages/backend/src/index.ts`, grouped with the other `@webstackbuilders` module loads. Note: the responder backend module is intentionally **not** loaded there yet (gated on the Kubernetes diagnostics milestone) — there is no existing agent-module load line to copy. This module can load independently because absent tools degrade to report limitations.
- **App config**: the backend module throws at boot without `ai.agents.catalogAiInsights.model`; add the config block (see Configuration) to the active `app-config*.yaml` before enabling the load, with `model` pointing at an installation-registered model ID.
- **Frontend app registration**: add `"@ai-crew-suite/plugin-agent-catalog-insights": "workspace:^"` to `packages/app/package.json`, import the default export from `.../plugin-ai-agent-frontend-catalog-ai-insights/alpha` in `packages/app/src/App.tsx`, and extend the plugin-ID expectations in `packages/app/src/App.test.tsx` — copy the existing `kubernetes-ai-responder` wiring in all three files.
- **Yarn PnP refresh**: run `yarn install` after any `package.json` dependency edits, then `yarn typecheck --force` and `yarn lint --force` per `plugin-registration.md`.

## Agent Definition

```ts
{
  id: 'catalog-ai-insights',
  modelRef: config.modelRef,          // installation-registered ID, e.g. 'catalog-insights'
  workflowRef: 'catalog-insights',
  memory: 'session',                  // follow-up questions reuse entity context
  systemPrompt: CATALOG_AI_INSIGHTS_SYSTEM_PROMPT,
  toolIds: [
    'knowledge.retrieve',
    'incident.oncall.get',
    'incident.incident.list',
    'observability.dashboard.list',
    'observability.logs.search',
    'kubernetes.workload.resolve',
    'kubernetes.workload.get_snapshot',
    'kubernetes.workload.get_timeline',
    'kubernetes.workload.list_events',
    'kubernetes.pod.get_snapshot',
    'vcs.pull_request.list',
  ],
  triggers: [
    { id: 'catalog-insights-question', source: 'manual', agentId: 'catalog-ai-insights' },
    { id: 'catalog-insights-nightly-scan', source: 'scheduler', agentId: 'catalog-ai-insights' },
  ],
}
```

- All tools are `effect: 'read'`. Missing tools (unconfigured drivers) are recorded as report limitations, never run failures.
- System prompt rules: answer only from the supplied context bundle; cite context IDs for every claim; say "not available in this installation" when a source is absent; never fabricate links, names, or deployment states.

## Run Input Contract

The generic `AgentRunInput.input.query` carries a versioned JSON payload (mirrors the responder's trigger-in-query pattern):

```ts
type CatalogInsightRequest = {
  version: 1;
  entityRef: string;            // required: 'component:default/payment-gateway'
  question: string;             // natural-language question, bounded length
  source: 'manual' | 'scheduler';
  sessionId?: string;           // follow-up continuity
  intentHint?: InsightIntent;   // optional UI shortcut, still re-validated
};
```

Validation rejects unknown versions, oversized questions, and malformed entity refs before any tool call.

## Insights Workflow

`CatalogInsightsGraph` registers as `WorkflowRunner` id `catalog-insights` and executes deterministic nodes. Unlike the responder's failure-signature routing, routing here is **question-intent** driven and happens before any tool or model call.

### Deterministic graph nodes

1. **request.validate** — parse/validate `CatalogInsightRequest`; resolve `entityRef` through `CatalogContextResolver` (summary, annotations, owner, relations at bounded depth). Unknown entity → terminal `error` event, no model call.
2. **intent.classify** — pure keyword/pattern classifier in `workflow/intents.ts` maps the question to one intent. `intentHint` is accepted only when the classifier agrees or returns `general-context`. No LLM classification in v1 (deterministic and free); a model-assisted fallback is a v2 option.
3. **context.gather** — invoke only the tool set mapped to the intent via `InsightToolRunner` (per-intent caps below). Every result becomes a normalized `ContextItem`.
4. **context.retrieve** — `InsightRetriever` calls `knowledge.retrieve` with the question text and an `entityFilter` scoped to the target entity; caps chunks at `maxRetrievalChunks`. Runs for every intent; it is the only RAG entry point.
5. **context.normalize** — dedupe, sort by relevance/recency, redact credential-like strings, cap total items/bytes, assign stable `ctx-N` IDs (`workflow/context.ts`).
6. **insight.synthesize** — one model call with the bundle + strict JSON output schema. Every claim must cite `ctx-N` IDs. Invalid or uncited output degrades to a deterministic answer built from structured context only (`workflow/insight.ts`).
7. **insight.finalize** — validate report schema, emit `catalog-insight-report` artifact, terminal `done` event.

### Intent routing table

| Intent | Tool calls (in order) | Notes |
| --- | --- | --- |
| `ownership-oncall` | `incident.oncall.get`, `incident.incident.list` | Catalog owner/relations from resolver already in bundle; PagerDuty annotation gates the incident calls. |
| `observability-links` | `observability.dashboard.list`, `observability.logs.search` (link-bearing results only) | Log search capped at `maxLogResults`; raw log bodies never enter the bundle. |
| `deployment-health` | `kubernetes.workload.resolve` → `get_snapshot` → `get_timeline` → `list_events` → `kubernetes.pod.get_snapshot`, then `vcs.pull_request.list` | Requires `backstage.io/kubernetes-id` annotation; otherwise recorded as a limitation. Reuses responder evidence-bounding norms. |
| `general-context` | none beyond resolver + retrieval | Pure catalog + RAG answer. |

### Report schema

```ts
type ContextItem = {
  id: string;                      // 'ctx-1' ... stable within a run
  source: 'catalog' | 'incident' | 'observability' | 'kubernetes' | 'vcs' | 'knowledge';
  kind: string;                    // e.g. 'oncall-schedule', 'dashboard-link', 'doc-chunk'
  observedAt?: string;
  summary: string;                 // redacted, bounded
  reference?: string;              // deep link (dashboard, PR, entity page)
};

type CatalogInsightReport = {
  entityRef: string;
  question: string;
  intent: InsightIntent;
  status: 'answered' | 'partial' | 'insufficient_context';
  answer: { text: string; citations: string[] }[];  // every block cites ctx IDs
  links: { label: string; url: string; citation: string }[];
  limitations: string[];           // absent drivers, missing annotations, cap truncations
  context: ContextItem[];          // the retained bundle, for UI display
};
```

## Vector Store Integration

- **No new vector infrastructure.** This plugin consumes the existing `knowledge.retrieve` contract; indexing of catalog metadata and TechDocs is owned by `plugin-ai-core-backend-module-retrieval-augmenter` with pgvector (or qdrant) storage. Runtime state (sessions, runs, artifacts) is owned by `plugin-ai-core-backend-module-runtime-store`.
- `InsightRetriever` responsibilities only: build the retrieval query (question + entity display name/type), scope with `entityFilter` on the target entity ref, cap `topK`, and map chunks into `ContextItem`s with `source: 'knowledge'`.
- If catalog-source retrieval quality is insufficient for relation-heavy questions, the fix belongs in the retrieval-augmenter's catalog indexing (chunking of relation edges/annotations), not in this plugin. Record that as a follow-up; do not fork the pipeline here.
- Tests never touch pgvector: mock `context.invokeTool` for `knowledge.retrieve` with pre-baked chunk fixtures keyed by query substring, per the foundation doc's determinism rule.

## Background Scheduler Tasks

New structural section — the responder has no scheduled surface; this plugin does.

- `scheduler/nightlyScan.ts` registers one task with `coreServices.scheduler`:
  - `id: 'catalog-ai-insights-nightly-scan'`, `frequency: { cron: config.scan.cron }` (default `0 3 * * *`), bounded `timeout`, non-zero `initialDelay`, `scope: 'global'` so exactly one instance runs per deployment.
- Task flow: `scanPlanner.ts` (pure) lists Components carrying `backstage.io/kubernetes-id` via `CatalogContextResolver.findByAnnotation`, caps at `maxScanEntities`, and emits a scan plan. The task then POSTs one run per planned entity to `/agents/catalog-ai-insights/runs` using `auth.getPluginRequestToken` + `discovery.getBaseUrl('ai-core')`, with `source: 'scheduler'` and a fixed deployment-health probe question. It never invokes the graph in-process — scheduled runs must be persisted, replayable, and auditable exactly like manual runs.
- Scan runs on degraded workloads produce `catalog-insight-report` artifacts (`status: 'partial' | 'answered'`); v1 surfaces them via the runs API/frontend only. Slack dispatch (`communication.message.post`) is v1.1, behind approval policy.
- Guardrails: per-scan entity cap, sequential dispatch with delay, skip when a previous scan is still in flight (scheduler mutex), and config kill switch `scan.enabled` (default **false** — opt-in).

## Configuration

```yaml
ai:
  agents:
    catalogAiInsights:
      model: catalog-insights     # installation-registered model ID, required
      maxContextItems: 24         # optional, default 24
      maxRetrievalChunks: 6       # optional, default 6
      maxLogResults: 5            # optional, default 5
      maxToolInvocations: 10      # optional, default 10
      lookbackMinutes: 1440       # optional, default 1440 (deployment/PR window)
      scan:
        enabled: false            # optional, default false
        cron: '0 3 * * *'         # optional
        maxScanEntities: 25       # optional, default 25
```

`config.ts` mirrors `readKubernetesAiResponderConfig`: throw when the section or `model` is absent; document all defaults in `config.d.ts`. The model ID maps to a provider via the installation's chat-model module; no provider names, endpoints, or credentials in plugin code.

## Shared AI-Core Work To Build First

- **`CatalogEntityResolver` in `plugin-ai-core-node/src/catalog/`** — this plugin is the first consumer of the interface already specified in the responder plan (`getEntitySummary`, `findByAnnotation`, `getRelations`, `getIntegrationReferences`). Implement the interface + pure mapping/relation-bounding there with standalone unit tests; implement the `catalogServiceRef`-backed adapter as `services/CatalogContextResolver.ts` in this package. Promote the adapter to core only when the second consumer (`rfc-adr-ai-reviewer` or `search-ai-context`) lands.
- **No other core changes required.** `workflowRunnerExtensionPoint`, `WorkflowContext.invokeTool`, artifact/audit sinks, and SSE replay already exist from responder Milestone 0. If `invokeTool` result summaries prove too lossy for link extraction (dashboard URLs), extend `ToolInvocationResult` generically — never with catalog-specific fields.

## Frontend Plan

Mirror the responder frontend package layout and wiring exactly (new-frontend-system `alpha.ts`, `extensions/`, self-contained wire types in `@types/`, SSE client over `discoveryApi.getBaseUrl('ai-core')` with `eventsource-parser` and `Last-Event-ID` replay):

```text
plugins/frontend/plugin-ai-agent-frontend-catalog-ai-insights/
  src/
    index.ts
    alpha.ts
    plugin.ts
    routes.ts                     # rootRouteRef for the standalone insights page
    @types/index.ts               # CatalogInsightRequest/Report wire types (backend pkg is not isomorphic)
    api/
      apiRef.ts
      client.ts                   # CatalogAiInsightsClient: askQuestion(), streamRunEvents()
      index.ts
    hooks/
      useInsightRun.ts            # pure reduceInsightRun reducer + hook (ask/resume/reset)
    components/
      index.ts
      EntityInsightsCard.tsx      # entity-page card: canned intent buttons + free question
      AskInsightDialog.tsx
      InsightRunView.tsx          # live step/tool progress from SSE
      AnswerPanel.tsx             # cited answer blocks; citations expand ContextItems
      ContextPanel.tsx            # retained bundle, grouped by source, deep links
      InsightStatusBanner.tsx
    extensions/
      api.ts
      components.ts
    __tests__/
```

Frontend deltas vs the responder (everything else is identical):

- `backstage.pluginId: 'catalog-ai-insights'`; package `@ai-crew-suite/plugin-agent-catalog-insights`.
- Primary surface is the **catalog entity page card** (attached via entity content extension), not a standalone incident page; the standalone route is secondary, for deep links to run IDs.
- `askQuestion()` POSTs `/agents/catalog-ai-insights/runs` with the JSON `CatalogInsightRequest` as the query; the report renders from the `catalog-insight-report` artifact event.
- Preserve `sessionId` across questions on the same entity so follow-ups reuse session memory.
- Render `status: 'insufficient_context'` and `limitations` prominently; every answer block shows its citations; no uncited text is displayed as fact.

## Test Strategy

Reuse the responder's test-layer table (unit/contract/backend integration/runtime integration/LLM evaluation/full-stack E2E) and its network policies. Deltas only:

- **Unit**: `intents.ts` classification matrix (question → intent, hint override rules); `scanPlanner.ts` bounding; `context.ts` dedupe/redaction/ID assignment; `insight.ts` schema validation + uncited-output degradation.
- **Workflow (runtime) tests**: drive `CatalogInsightsGraph.run()` with a stubbed `WorkflowContext` whose `invokeTool` is a **dynamic mock router keyed by `toolId` + args** — the codebase-accurate replacement for the foundation doc's `createServiceFactory`/`kubernetes.service` sketch. Scenarios: on-call answered; dashboards linked; `CrashLoopBackOff` deployment-health explained with PR correlation; missing PagerDuty annotation → limitation; missing kubernetes tool → `partial`; unknown entity → error; retrieval-only `general-context`.
- **Stateful mock factory**: implement the foundation doc's "deployment transitioning from success to failure" requirement as a mutable fixture store behind the mocked `kubernetes.*` tool IDs — ask once (healthy), mutate fixture state, ask again (failing), and assert the second report cites the new events, proving no cross-run context leakage.
- **`knowledge.retrieve` isolation**: pre-baked chunk fixtures selected by query substring; assert prompt construction and `entityFilter` scoping without real vector search or LLM behavior.
- **Scheduler tests**: `mockServices.scheduler` fast-forwards ticks; assert the task POSTs bounded, authenticated run requests (spy on fetch/discovery), respects `scan.enabled: false`, and skips overlapping scans.
- **Backend integration**: `startTestBackend` with this module + AI Core + `mockServices.rootConfig` agent config, asserting boot registration, run→SSE event order, and artifact persistence.
- **E2E**: the shared fixture profile (`app-config.e2e.yaml`, `packages/backend/e2e-fixtures/`, `yarn dev:e2e-fixture`) is specified in the responder plan but **does not exist yet** — create it per that spec if the responder has not landed it first, then add an annotated `payment-gateway` entity and fixture tool modules. Playwright scenario (extend `packages/app/e2e-tests/`): open entity card → ask "why did the last deployment fail?" → assert cited answer, context panel, and deep-linkable run ID. Add `yarn test:e2e:catalog-ai-insights`.

## Security and Operational Guardrails

Responder guardrails apply unchanged (identity propagation, redaction before model/SSE/artifacts, tool/token/wall-clock caps, correlation IDs). Insights-specific additions:

- Enforce catalog permission-aware access: a user must be able to read the entity to ask about it; scheduled runs use the service principal and record it on the run.
- On-call answers expose names/schedules — never persist them into vector storage or session memory beyond the run artifact.
- Cap question length and treat question text as untrusted prompt input: the context bundle is clearly delimited and the system prompt forbids following instructions found inside it.
- Scheduler scans are opt-in, capped, and mutex-guarded; a scan can never trigger writes in v1.

## Ordered Implementation Milestones

### Milestone 0: Shared helpers and schemas

- [ ] Add `CatalogEntityResolver` interface + pure mapping and tests in `plugin-ai-core-node/src/catalog/`.
- [ ] Define `CatalogInsightRequest`, `ContextItem`, `CatalogInsightReport`, the intent enum, and the config schema.
- [ ] Confirm tool IDs against the registered tool catalog at boot (fail startup on unknown allow-list entries).

Exit criteria: resolver unit tests pass; schemas validate fixture payloads.

### Milestone 1: Insights backend

- [ ] Scaffold package, register runner/agent/triggers, implement config parsing; register in root `tsconfig.json` + `.eslintrc.cjs`.
- [ ] Wire the module into `packages/backend` (package.json + `index.ts`) and add the `ai.agents.catalogAiInsights` config block (see Monorepo And App Wiring).
- [ ] Implement intent classifier, per-intent gather, retrieval wrapper, normalization, synthesis + degradation, and artifact finalization.
- [ ] Add unit, workflow-scenario (stateful mock router), and backend integration tests.

Exit criteria: all intent scenarios pass deterministically with no real LLM or third-party service.

### Milestone 2: Scheduler scan

- [ ] Implement `scanPlanner` + `nightlyScan` task with authenticated run dispatch and guardrails.
- [ ] Scheduler tests with fast-forwarded ticks; overlap and kill-switch coverage.

Exit criteria: a fast-forwarded tick produces persisted, replayable scan runs in the test backend.

### Milestone 3: Frontend and E2E

- [ ] Implement the frontend plugin (entity card, ask flow, SSE run view, cited answer/context panels) and register it in `packages/app` (package.json, `App.tsx`, `App.test.tsx`).
- [ ] Component tests (loading, streaming, insufficient-context, reconnect/replay) plus accessibility checks.
- [ ] Extend the E2E fixture profile and add the Playwright insights scenario with screenshot review.

Exit criteria: `yarn test:e2e:catalog-ai-insights` demonstrates a complete cited answer in a browser without external infrastructure.

### Milestone 4: Production readiness

- [ ] Document model registration, driver configuration, scan enablement, and permission requirements.
- [ ] Dashboards/alerts for failed runs, degraded-source rate, scan duration, and model cost.
- [ ] Opt-in real-model evaluation suite (grounding: citations resolve to supplied ctx IDs; no fabricated links/names) within budget.

Exit criteria: staged rollout with scans disabled by default, bounded costs, and verified citation grounding.

## Definition of Done

- Package, agent, runner, triggers, config schema, and read-only allow-list implemented and registered (root configs included).
- Runs execute through the real AI Core controller/runtime with persisted, replayable events and `catalog-insight-report` artifacts.
- Every intent scenario and the stateful deployment-transition scenario pass deterministically; scheduler behavior is proven with fast-forwarded ticks.
- Frontend renders cited answers from live SSE and replay; Playwright verifies the entity-card flow end to end on fixtures.
- No output surface (SSE, artifacts, logs, tests) contains raw logs, secrets, or uncited model claims presented as fact.

## Frontend Completed

Implemented `@ai-crew-suite/plugin-agent-catalog-insights`.

### Delivered

- Complete frontend plugin under:
  - `/home/kevin/Repos/backstage/ai-crew-suite/plugins/frontend/plugin-ai-agent-frontend-catalog-ai-insights`

- Typed AI Core SSE client for:

  - starting catalog-insight runs
  - replaying existing run events
  - session continuity for follow-up questions

- Insight run reducer/hook with progress, tool activity, report artifact extraction, error handling, and replay support.

- UI surfaces:

  - catalog entity insights card with canned and free-form questions
  - standalone deep-linkable `/catalog-ai-insights` page
  - live run progress/status
  - cited answer panel with expandable cited context
  - retained context panel grouped by source
  - partial and insufficient-context states

- Legacy and new frontend-system exports/extensions, including the catalog entity-card extension.

- Dev harness and documentation.

- Unit coverage for run-state reduction/replay/session behavior and accessible status-banner states.

### Repository/app integration

Registered the plugin in:

- `/home/kevin/Repos/backstage/ai-crew-suite/tsconfig.json`
- `/home/kevin/Repos/backstage/ai-crew-suite/.eslintrc.cjs`
- `/home/kevin/Repos/backstage/ai-crew-suite/packages/app/package.json`
- `/home/kevin/Repos/backstage/ai-crew-suite/packages/app/src/App.tsx`
- `/home/kevin/Repos/backstage/ai-crew-suite/packages/app/src/App.test.tsx`
- `/home/kevin/Repos/backstage/ai-crew-suite/yarn.lock`

Also removed generated test/cache artifacts from the plugin directory.

## Backend 
