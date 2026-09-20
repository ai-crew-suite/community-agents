# On-Call Handover Assistant Implementation Plan

## Overview

This plugin automates the collection of shift events, unresolved alerts, and systemic notes to generate structured summary briefs for incoming on-call engineers.

- **The Task:** Briefing the incoming on-call engineer on the previous shift.
- **The Logic:** A **LangGraph** agent summarizes the most frequent alerts and service changes from the previous shift.

## Goal

Implement `@ai-crew-suite/plugin-agent-oncall-handover-backend` as an AI Core backend module that compiles a structured **shift handover brief** for an incoming on-call engineer. It aggregates a trailing operational window (default 12h, configurable) across incidents/alerts, deployments, merged PRs, and open high-severity tickets, deduplicates and clusters the noise, and produces a cited, LLM-summarized brief. A paired frontend plugin surfaces the brief on demand and shows scheduled pre-shift briefs.

Reuse the architecture proven by `plugin-ai-agent-backend-catalog-ai-insights` (its `_IMPLEMENTATION.md` is the source of truth for repository conventions, workflow-runner mechanics, event contracts, monorepo wiring, and test-layer definitions). This plan documents only what differs: **time-windowed aggregation** (not entity-scoped Q&A), alert clustering, and shift-boundary scheduling.

## Delivery Boundary

### In scope

- Compile one handover brief per run for a trailing time window and optional team/rotation scope, via the generic `/agents/oncall-ai-handover-assistant/runs` route.
- Deterministic LangGraph-style aggregation: parallel collection nodes → deduplication/clustering node → LLM summarizer node → finalize.
- Bounded collection over incidents/alerts, Kubernetes deployment/scaling events, merged PRs, and open high-severity tickets — all through registered read-only AI Core tools.
- Optional entity-scoped RAG via `knowledge.retrieve` for runbook/context enrichment of clustered incidents.
- A structured, citation-required `HandoverBrief` artifact plus streaming run events (same `AgentEvent` union as catalog-ai-insights).
- Scheduled pre-shift briefs at configured shift-change times (e.g. 08:00 / 16:00), persisted and replayable like on-demand runs.
- A minimal frontend: on-demand "compile brief" action, live SSE run view, clustered-alert / deployment / ticket panels, and a scheduled-brief history list.

### Explicitly out of scope for v1

- Any write tool (`incident.incident.annotate`, `project.ticket.create/comment`, `communication.message.post`). Slack/ticket dispatch of the brief is deferred to v1.1 behind approval policy.
- Mutating incidents, tickets, Kubernetes, or repositories.
- Rotation/scheduling management (reading who is on call is fine; editing rotations is not).
- A generic replacement for PagerDuty/Jira dashboards.

## Required Prerequisites

Contracts verified against the current codebase. As with the catalog plan: no fictional service refs — the foundation doc's `pagerduty.service`/`jira.service` mock sketches must not be implemented; mock the registered tool IDs through the workflow context instead.

| Capability | Required contract | Current state | Required action |
| --- | --- | --- | --- |
| Alerts/incidents/on-call | `incident.alert.history`, `incident.incident.list`, `incident.incident.get`, `incident.oncall.get` | Exist (incident-management module, PagerDuty driver); all `effect: read` | Window-bound the alert history; degrade gracefully when no driver is configured. |
| Deployment/scaling events | `kubernetes.workload.get_timeline`, `kubernetes.workload.list_events`, `kubernetes.workload.get_snapshot` | Tools exist; Backstage-aware diagnostics gated by responder Milestone 0 | Same gate; do not duplicate it. Missing tool → brief limitation, not run failure. |
| Merged PRs / IaC changes | `vcs.pull_request.list` | Exists (VCS module) | Filter to the shift window and to production-relevant repos where resolvable. |
| Open high-severity tickets | `project.ticket.search`, `project.ticket.get` | Exist (project-management module, Jira driver); `effect: read` | Query open high-priority incident tickets for the scoped team. |
| Runbook/context enrichment | `knowledge.retrieve` + `DefaultRetrievalPipeline` | Exists (retrieval-augmenter + pgvector/qdrant) | Optional per top cluster; cap chunks. Not the primary data path. |
| Stateful runs, SSE, artifacts | AI Core run controller + `workflowRunnerExtensionPoint` + runtime stores | Exist | Register runner `oncall-handover`; reuse `/agents/:id/runs` and event replay. |
| Scheduled runs | `coreServices.scheduler` + `coreServices.discovery` + `coreServices.auth` | Core services available; no AI Core scheduler abstraction | Schedule in-module; dispatch authenticated plugin-to-plugin POSTs to the AI Core route. |
| Identity of on-demand requester | `coreServices.httpAuth` (via AI Core route) | Handled by AI Core controller | No custom auth; rely on the run route's credential propagation. |

## Package Shape

Backend module from the same template as catalog-ai-insights; only the domain directories differ:

```text
plugins/backend/plugin-ai-agent-backend-oncall-ai-handover-assistant/
  package.json          # role: backend-plugin-module, pluginId: ai-core
  tsconfig.json
  config.d.ts
  README.md
  src/
    index.ts
    module.ts           # registers runner, agent, triggers, scheduler tasks
    agent.ts            # ONCALL_HANDOVER_AGENT_ID, tool allow-list, system prompt
    config.ts           # readOncallHandoverConfig (ai.agents.oncallHandover)
    workflow/
      HandoverGraph.ts          # WorkflowRunner id 'oncall-handover'
      state.ts                  # HandoverState (arrays accumulate node-by-node)
      window.ts                 # shift-window resolution + bounds validation
      collectors.ts             # parallel per-source collection -> RawSignal[]
      clustering.ts             # dedupe + cluster alerts/incidents into IncidentCluster[]
      brief.ts                  # HandoverBrief schema, validation, degradation
    retrieval/
      RunbookRetriever.ts       # knowledge.retrieve wrapper for top clusters, topK cap
      promptContext.ts          # clustered state -> summarizer prompt, citation rules
    scheduler/
      shiftSchedule.ts          # coreServices.scheduler registration (per shift boundary)
      schedulePlanner.ts        # pure: shift config -> dispatch plan
    services/
      HandoverToolRunner.ts     # capped invokeTool facade (mirrors InsightToolRunner)
      HandoverArtifactWriter.ts
    __tests__/
    workflow/__tests__/
    retrieval/__tests__/
    scheduler/__tests__/
    services/__tests__/
```

- `createBackendModule` with `pluginId: 'ai-core'`, `moduleId: 'agent-oncall-handover-assistant'`.
- `module.ts` deps: `coreServices.rootConfig`, `logger`, `scheduler`, `discovery`, `auth`, plus `agentExtensionPoint`, `triggerExtensionPoint`, `workflowRunnerExtensionPoint`. No `catalogServiceRef` needed — this workflow is time-windowed, not entity-resolved (team/rotation scope comes from the request payload and `incident.oncall.get`).
- Package naming, scripts, Apache header, root `tsconfig.json` references, and `.eslintrc.cjs` role overrides follow catalog-ai-insights and `plugin-registration.md` verbatim (not repeated here).

## Monorepo And App Wiring

Same delegated-but-verified steps as catalog-ai-insights (see that plan's "Monorepo And App Wiring"). Deltas for this package:

- **Backend load**: add `"@ai-crew-suite/plugin-agent-oncall-handover-backend": "workspace:^"` to `packages/backend/package.json` and `backend.add(loadBackendFeature(import('@ai-crew-suite/plugin-agent-oncall-handover-backend')))` in `packages/backend/src/index.ts`. If catalog-ai-insights has already landed there, copy that line as the template; otherwise follow the `@webstackbuilders` module-load grouping.
- **App config**: the module throws at boot without `ai.agents.oncallHandover.model`; add the config block (see Configuration) before enabling the load.
- **Frontend registration**: add `"@ai-crew-suite/plugin-agent-oncall-handover": "workspace:^"` to `packages/app/package.json`, import its `/alpha` default export in `packages/app/src/App.tsx`, and extend plugin-ID expectations in `packages/app/src/App.test.tsx` — copy the `kubernetes-ai-responder` / `catalog-ai-insights` wiring.
- **Yarn PnP refresh**: `yarn install` after dependency edits, then `yarn typecheck --force` / `yarn lint --force`.

## Agent Definition

```ts
{
  id: 'oncall-handover-assistant',
  modelRef: config.modelRef,          // installation-registered ID, e.g. 'oncall-handover'
  workflowRef: 'oncall-handover',
  memory: 'none',                     // each brief is a fresh window; no cross-run memory
  systemPrompt: ONCALL_HANDOVER_SYSTEM_PROMPT,
  toolIds: [
    'incident.alert.history',
    'incident.incident.list',
    'incident.incident.get',
    'incident.oncall.get',
    'kubernetes.workload.get_timeline',
    'kubernetes.workload.list_events',
    'kubernetes.workload.get_snapshot',
    'vcs.pull_request.list',
    'project.ticket.search',
    'project.ticket.get',
    'knowledge.retrieve',
  ],
  triggers: [
    { id: 'oncall-handover-on-demand', source: 'manual', agentId: 'oncall-handover-assistant' },
    { id: 'oncall-handover-shift-change', source: 'scheduler', agentId: 'oncall-handover-assistant' },
  ],
}
```

- All tools are `effect: 'read'`. Missing tools (unconfigured drivers) become brief limitations, never run failures.
- `memory: 'none'` — unlike catalog-ai-insights' session follow-ups, each handover is a self-contained window snapshot; carrying prior state would leak stale operational context into a new shift.
- System prompt rules: summarize only from the supplied clustered signal bundle; cite signal IDs for every statement; rank by operational risk (active incidents > unresolved tickets > risky deploys > noise); say "no data available for this source" when a source is absent; never invent alert counts, PR authors, or ticket statuses.

## Run Input Contract

The generic `AgentRunInput.input.query` carries a versioned JSON payload (mirrors the catalog plan's request-in-query pattern):

```ts
type HandoverRequest = {
  version: 1;
  source: 'manual' | 'scheduler';
  windowHours?: number;         // default from config (12); hard-capped at maxWindowHours
  endsAt?: string;              // ISO; defaults to now. Window is [endsAt - windowHours, endsAt]
  team?: string;                // rotation/team scope for on-call + tickets
  entityRefs?: string[];        // optional narrowing to specific services/workloads
  incomingEngineer?: string;    // display-only, for the brief header
};
```

Validation clamps `windowHours` to `maxWindowHours`, rejects unknown versions and malformed timestamps, and requires either `team` or `entityRefs` so collection is bounded (a whole-workspace unscoped scan is rejected).

## Handover Workflow

`HandoverGraph` registers as `WorkflowRunner` id `oncall-handover`. It implements the foundation doc's LangGraph aggregation loop: **state arrays accumulate node-by-node**, then a single summarizer node runs. Unlike catalog-ai-insights' intent routing, all collectors run every time (bounded to the window); there is no per-question branching.

### Deterministic graph nodes

1. **window.resolve** — validate `HandoverRequest`; compute the `[start, end]` window (`workflow/window.ts`); resolve on-call scope via `incident.oncall.get` for the header. Invalid/oversized window → terminal `error` event, no model call.
2. **collect.parallel** — run source collectors concurrently through `HandoverToolRunner`, each window- and count-bounded (`workflow/collectors.ts`):
   - alerts/incidents: `incident.alert.history` + `incident.incident.list` (+ `incident.incident.get` for active ones only)
   - deploys: `kubernetes.workload.get_timeline` / `list_events` / `get_snapshot`
   - changes: `vcs.pull_request.list` (merged in window)
   - tickets: `project.ticket.search` (open, high-priority) + `project.ticket.get` for top hits
   Each result normalizes into a `RawSignal` with a stable `sig-N` ID. A failed/absent collector records a limitation and yields an empty set.
3. **cluster.analyze** — deterministic dedupe + clustering (`workflow/clustering.ts`): group repeated alerts by `(service, title)` within a time-proximity threshold into `IncidentCluster`s with counts, first/last seen, and correlated deploys/PRs/tickets. This is the node the foundation doc calls out for verification (50 alerts → N clusters). No LLM here.
4. **context.enrich** — optional: for the top `maxEnrichedClusters` clusters, `RunbookRetriever` calls `knowledge.retrieve` (cluster title + service) and attaches capped `sig` items with `source: 'knowledge'`.
5. **brief.summarize** — one model call with the clustered bundle + strict JSON output schema; every statement cites `sig-N` IDs. Invalid/uncited output degrades to a deterministic brief assembled from the clusters (`workflow/brief.ts`).
6. **brief.finalize** — validate schema, emit `oncall-handover-brief` artifact, terminal `done` event.

### State and brief schema

```ts
type RawSignal = {
  id: string;                     // 'sig-1' ...
  source: 'incident' | 'kubernetes' | 'vcs' | 'project' | 'knowledge';
  kind: string;                   // 'alert' | 'incident' | 'deployment' | 'pr' | 'ticket' | 'runbook'
  observedAt?: string;
  service?: string;
  summary: string;                // redacted, bounded
  reference?: string;             // deep link
};

type IncidentCluster = {
  id: string;                     // 'cluster-1' ...
  service?: string;
  title: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
  status: 'active' | 'resolved' | 'unknown';
  signals: string[];              // sig IDs in this cluster
  correlated: string[];           // sig IDs of related deploys/PRs/tickets
};

// HandoverState (LangGraph): { request, window, signals: RawSignal[],
//   clusters: IncidentCluster[], limitations: string[] } accumulated across nodes.

type HandoverBrief = {
  window: { start: string; end: string };
  team?: string;
  incomingEngineer?: string;
  currentOncall?: string;
  status: 'compiled' | 'partial' | 'no_activity';
  highlights: { text: string; severity: 'high' | 'medium' | 'low'; citations: string[] }[];
  activeIncidents: IncidentCluster[];
  openTickets: { key: string; summary: string; status: string; citation: string }[];
  notableChanges: { summary: string; citation: string }[];
  recommendedWatchItems: string[];
  limitations: string[];
  signals: RawSignal[];           // retained bundle for UI display
};
```

## Vector Store Integration

- **No new vector infrastructure.** RAG here is a secondary enrichment path only: `RunbookRetriever` calls the existing `knowledge.retrieve` contract for the top clusters. Indexing/storage remain owned by `plugin-ai-core-backend-module-retrieval-augmenter` (pgvector/qdrant); runtime state by `plugin-ai-core-backend-module-runtime-store`.
- `RunbookRetriever` responsibilities only: build the query from a cluster's title + service, cap `topK`, map chunks into `RawSignal`s with `source: 'knowledge'`. It never gates brief production — a retrieval miss just yields fewer runbook signals.
- Tests never touch pgvector: mock `context.invokeTool` for `knowledge.retrieve` with pre-baked chunk fixtures keyed by cluster title.

## Background Scheduler Tasks

The primary trigger for this plugin is the shift boundary — larger than catalog-ai-insights' single nightly scan.

- `scheduler/shiftSchedule.ts` registers one `coreServices.scheduler` task **per configured shift boundary**:
  - `id: 'oncall-handover-shift-<HHMM>'`, `frequency: { cron }` derived from each `shifts[].cron` (e.g. `0 8 * * *`, `0 16 * * *`), bounded `timeout`, non-zero `initialDelay`, `scope: 'global'` (one instance per deployment).
- Task flow: `schedulePlanner.ts` (pure) turns the shift config into a dispatch plan (window = the just-ended shift length, `team` per shift). The task POSTs one run to `/agents/oncall-handover-assistant/runs` using `auth.getPluginRequestToken` + `discovery.getBaseUrl('ai-core')`, `source: 'scheduler'`. It never runs the graph in-process — scheduled briefs must be persisted, replayable, and auditable exactly like on-demand runs, and pre-compiled so the incoming engineer's UI loads instantly.
- Guardrails: per-shift single dispatch, skip when the previous same-shift run is still in flight (scheduler mutex), and a config kill switch `schedule.enabled` (default **false** — opt-in).

## Configuration

```yaml
ai:
  agents:
    oncallHandover:
      model: oncall-handover      # installation-registered model ID, required
      windowHours: 12             # optional, default 12
      maxWindowHours: 48          # optional, default 48 (clamp)
      maxSignalsPerSource: 100    # optional, default 100
      maxClusters: 25             # optional, default 25
      maxEnrichedClusters: 5      # optional, default 5
      maxToolInvocations: 16      # optional, default 16
      schedule:
        enabled: false            # optional, default false
        shifts:                   # optional; each generates one scheduler task
          - { cron: '0 8 * * *',  team: 'sre-primary' }
          - { cron: '0 16 * * *', team: 'sre-primary' }
```

`config.ts` mirrors `readCatalogAiInsightsConfig`: throw when the section or `model` is absent; document all defaults in `config.d.ts`. The model ID maps to a provider via the installation's chat-model module; no provider names, endpoints, or credentials in plugin code.

## Shared AI-Core Work To Build First

- **None required.** This plugin consumes only already-registered read tools and the existing `workflowRunnerExtensionPoint` / `WorkflowContext.invokeTool` / artifact-sink / SSE-replay machinery. It does **not** depend on the `CatalogEntityResolver` helper that catalog-ai-insights introduces (no entity resolution in this workflow).
- If `invokeTool` result summaries prove too lossy for clustering (e.g. alert `service`/`title` fields), extend `ToolInvocationResult` generically — never with on-call-specific fields.

## Frontend Plan

Mirror the catalog-ai-insights / responder frontend package layout and wiring exactly (new-frontend-system `alpha.ts`, `extensions/`, self-contained wire types in `@types/`, SSE client over `discoveryApi.getBaseUrl('ai-core')` with `eventsource-parser` and `Last-Event-ID` replay):

```text
plugins/frontend/plugin-ai-agent-frontend-oncall-ai-handover-assistant/
  src/
    index.ts
    alpha.ts
    plugin.ts
    routes.ts                     # rootRouteRef for the standalone handover page
    @types/index.ts               # HandoverRequest/Brief wire types (backend pkg is not isomorphic)
    api/
      apiRef.ts
      client.ts                   # OncallHandoverClient: compileBrief(), streamRunEvents()
      index.ts
    hooks/
      useHandoverRun.ts           # pure reduceHandoverRun reducer + hook (compile/resume/reset)
    components/
      index.ts
      HandoverPage.tsx            # standalone: compile controls + latest/scheduled briefs
      CompileBriefDialog.tsx      # window/team/incoming-engineer inputs
      HandoverRunView.tsx         # live node/tool progress from SSE
      IncidentClusterPanel.tsx    # clustered alerts with counts + correlated changes
      DeploymentsPanel.tsx        # window deploys/scaling events
      TicketsPanel.tsx            # open high-priority tickets
      BriefHistoryList.tsx        # scheduled pre-shift briefs, deep-linkable
      HandoverStatusBanner.tsx
    extensions/
      api.ts
      components.ts
    __tests__/
```

Frontend deltas vs catalog-ai-insights:

- `backstage.pluginId: 'oncall-handover-assistant'`; package `@ai-crew-suite/plugin-agent-oncall-handover`.
- Primary surface is a **standalone handover page** (nav item), not a catalog entity-page card — a handover spans the whole rotation, not one entity. Optionally add a homepage card for "your next shift brief".
- `compileBrief()` POSTs `/agents/oncall-handover-assistant/runs` with the JSON `HandoverRequest` as the query; the brief renders from the `oncall-handover-brief` artifact event.
- `BriefHistoryList` reads recent scheduled runs via the runs API so a pre-compiled brief loads instantly at shift change.
- Render `status: 'no_activity'` and `limitations` prominently; every highlight shows its citations; clustered counts (e.g. "42× High Error Rate on catalog-service") are the headline UI, not raw alert lists.

## Test Strategy

Reuse the catalog plan's test-layer table and network policies. Deltas only:

- **Unit**: `window.ts` clamp/bounds math; `clustering.ts` dedupe/cluster correctness (the foundation doc's 50-alerts→N-clusters case, time-proximity thresholds, correlation of deploys/PRs/tickets to clusters); `brief.ts` schema validation + uncited-output degradation; `schedulePlanner.ts` shift→dispatch mapping.
- **Workflow (runtime) tests**: drive `HandoverGraph.run()` with a stubbed `WorkflowContext` whose `invokeTool` is a **dynamic mock router keyed by `toolId` + args** — the codebase-accurate replacement for the foundation doc's `pagerduty.service`/`jira.service` `createServiceFactory` sketch. Scenarios: noisy alerts cluster correctly and merge with Jira/K8s/VCS signals; empty window → `no_activity`; a missing incident driver → `partial` with a limitation; oversized window → clamped; unscoped request → error.
- **High-volume aggregation**: inject 50+ mock alerts across services and assert the cluster node produces the expected distinct clusters with correct counts and first/last-seen before any model call — proving deterministic aggregation independent of the LLM.
- **`knowledge.retrieve` isolation**: pre-baked chunk fixtures keyed by cluster title; assert enrichment attaches capped runbook signals without real vector search.
- **Scheduler tests**: `mockServices.scheduler` fast-forwards ticks to a shift boundary; assert the task POSTs one bounded, authenticated run per shift (spy on fetch/discovery), respects `schedule.enabled: false`, and skips overlapping same-shift runs. Confirm the brief lands as a persisted artifact (the foundation doc's "drops into the caching layer" requirement is satisfied by the runtime-store artifact sink, not a bespoke table).
- **Backend integration**: `startTestBackend` with this module + AI Core + `mockServices.rootConfig` agent config + `mockServices.database`, asserting boot registration, run→SSE event order, token/cost usage events recorded, and artifact persistence.
- **E2E**: extend the shared fixture profile (created per the catalog/responder spec if not yet landed) with fixture incident/VCS/K8s/ticket tool modules; Playwright scenario: open handover page → compile a 12h brief → assert clustered incidents, tickets panel, cited highlights, and a deep-linkable run ID. Add `yarn test:e2e:oncall-handover`.

## Security and Operational Guardrails

Catalog-ai-insights guardrails apply unchanged (identity propagation, redaction before model/SSE/artifacts, tool/token/wall-clock caps, correlation IDs). On-call-specific additions:

- Briefs expose on-call names, ticket assignees, and PR authors — never persist these into vector storage; keep them only in the run artifact.
- Enforce scope bounds: reject unscoped whole-workspace runs; clamp the window; cap signals per source so a noisy shift cannot exhaust tokens or memory.
- Scheduled briefs use the service principal and record it on the run; the incoming engineer's on-demand runs use their propagated identity.
- No write tool in v1; a future "post brief to Slack / annotate incident" step must be an artifact-gated, approval-required action.

## Ordered Implementation Milestones

### Milestone 0: Schemas and pure logic

- [ ] Define `HandoverRequest`, `RawSignal`, `IncidentCluster`, `HandoverBrief`, and the config schema.
- [ ] Implement + unit-test `window.ts`, `clustering.ts`, and `schedulePlanner.ts` (pure, no I/O).
- [ ] Confirm tool IDs against the registered tool catalog at boot (fail startup on unknown allow-list entries).

Exit criteria: clustering and window math pass deterministically; schemas validate fixtures.

### Milestone 1: Handover backend

- [ ] Scaffold package, register runner/agent/triggers, implement config parsing; register in root `tsconfig.json` + `.eslintrc.cjs`.
- [ ] Implement parallel collectors, clustering, optional enrichment, summarization + degradation, and artifact finalization.
- [ ] Wire the module into `packages/backend` and add the `ai.agents.oncallHandover` config block (see Monorepo And App Wiring).
- [ ] Add unit, workflow-scenario (dynamic mock router + high-volume aggregation), and backend integration tests.

Exit criteria: all scenarios pass deterministically with no real LLM or third-party service.

### Milestone 2: Shift scheduler

- [ ] Implement `shiftSchedule` per-boundary task registration with authenticated run dispatch and guardrails.
- [ ] Scheduler tests with fast-forwarded ticks; overlap and kill-switch coverage; assert persisted brief artifacts.

Exit criteria: a fast-forwarded shift boundary produces one persisted, replayable brief run.

### Milestone 3: Frontend and E2E

- [ ] Implement the frontend plugin (compile flow, SSE run view, cluster/deploy/ticket panels, brief history) and register it in `packages/app` (package.json, `App.tsx`, `App.test.tsx`).
- [ ] Component tests (loading, streaming, no-activity, reconnect/replay) plus accessibility checks.
- [ ] Extend the E2E fixture profile and add the Playwright handover scenario with screenshot review.

Exit criteria: `yarn test:e2e:oncall-handover` demonstrates a complete cited, clustered brief in a browser without external infrastructure.

### Milestone 4: Production readiness

- [ ] Document model registration, driver configuration, shift-schedule enablement, and scoping requirements.
- [ ] Dashboards/alerts for failed runs, degraded-source rate, brief compile duration, token/cost, and empty-window rate.
- [ ] Opt-in real-model evaluation suite (grounding: highlights cite existing sig IDs; cluster counts match the bundle; no fabricated names) within budget.

Exit criteria: staged rollout with schedules disabled by default, bounded costs, and verified citation/cluster grounding.

## Definition of Done

- Package, agent, runner, triggers, config schema, and read-only allow-list implemented and registered (root + app/backend wiring included).
- Runs execute through the real AI Core controller/runtime with persisted, replayable events, token/cost usage, and `oncall-handover-brief` artifacts.
- Deterministic clustering is proven on high-volume fixtures; scheduled shift briefs are proven with fast-forwarded ticks.
- Frontend renders clustered, cited briefs from live SSE and replay; Playwright verifies the compile flow end to end on fixtures.
- No output surface (SSE, artifacts, logs, tests) contains raw logs, secrets, or uncited model claims presented as fact.

## Frontend Completed

Implemented the standalone frontend plugin:

`/home/kevin/Repos/backstage/ai-crew-suite/plugins/frontend/plugin-ai-agent-frontend-oncall-ai-handover-assistant`

### Delivered

- Typed frontend wire contracts for:

  - `HandoverRequest`
  - `HandoverBrief`
  - incident clusters and retained signals
  - AI Core run events

- Typed AI Core SSE client:

  - `compileBrief()` posts to `agents/oncall-handover-assistant/runs`
  - `streamRunEvents()` supports `Last-Event-ID` replay

- Pure run reducer/hook for:

  - streaming graph progress
  - tool status
  - artifact extraction from `oncall-handover-brief`
  - terminal errors and replayed runs

- New frontend-system and legacy plugin entry points:

  - `/alpha` feature export
  - standalone route at `/oncall-handover-assistant`

- Standalone handover page with:

  - compile dialog for team, trailing window, and incoming engineer
  - live run/SSE progress
  - deep-linkable run IDs using `?run=<id>`
  - status banner for compiling, partial, no-activity, success, and error states
  - clustered active-incident panel
  - deployments/notable-changes panel
  - high-priority tickets panel
  - limitations panel

### App and monorepo wiring

Registered the frontend package in:

- `/home/kevin/Repos/backstage/ai-crew-suite/tsconfig.json`
- `/home/kevin/Repos/backstage/ai-crew-suite/.eslintrc.cjs`
- `/home/kevin/Repos/backstage/ai-crew-suite/packages/app/package.json`
- `/home/kevin/Repos/backstage/ai-crew-suite/packages/app/src/App.tsx`
- `/home/kevin/Repos/backstage/ai-crew-suite/packages/app/src/App.test.tsx`
- `/home/kevin/Repos/backstage/ai-crew-suite/yarn.lock`

### Limitation

The implementation plan calls for a `BriefHistoryList` of scheduled briefs. AI Core currently exposes run creation and per-run event replay, but no confirmed runs-list endpoint. I did not invent a history API; scheduled briefs are supported through their persisted, deep-linkable `?run=<id>` replay path.

## Backend Completed

### Implemented backend capabilities

- AI Core backend module registration:

  - workflow runner: `oncall-handover`
  - agent: `oncall-handover-assistant`
  - manual and scheduler triggers
  - optional shift-boundary scheduler registration

- Read-only tool allow-list matching the plan:

  - incident alerts/incidents/on-call
  - Kubernetes timeline
  - merged PRs
  - open high-priority tickets
  - `knowledge.retrieve` runbook enrichment

- Versioned, scoped `HandoverRequest` parsing:

  - requires `team` or `entityRefs`
  - validates timestamps and window inputs
  - clamps window duration to configured max

- Deterministic workflow:

  1. resolve window
  2. parallel bounded source collection
  3. deterministic incident/noise clustering
  4. optional runbook enrichment
  5. deterministic cited brief assembly
  6. `oncall-handover-brief` artifact finalization

- Graceful degradation:

  - failed/missing tool drivers become brief limitations
  - no write tools
  - invocation and per-source signal limits are enforced

- Shift scheduler:

  - one global task per configured cron boundary
  - authenticated POST to the AI Core run route
  - in-flight mutex per scheduled shift dispatch
  - opt-in via `schedule.enabled`

### Repository wiring

Added:

- Root TypeScript project reference in `/home/kevin/Repos/backstage/ai-crew-suite/tsconfig.json`

- Backend-module ESLint role override in `/home/kevin/Repos/backstage/ai-crew-suite/.eslintrc.cjs`

- Backend workspace dependency and backend feature load:

  - `/home/kevin/Repos/backstage/ai-crew-suite/packages/backend/package.json`
  - `/home/kevin/Repos/backstage/ai-crew-suite/packages/backend/src/index.ts`

- Required active configuration:

  - `/home/kevin/Repos/backstage/ai-crew-suite/app-config.yaml`
  - `ai.agents.oncallHandover.model: oncall-handover`

- Yarn workspace lockfile update.

### Tests added

- Request scoping and window clamping
- High-volume deterministic alert clustering (`50` alerts → expected clusters)
- No-activity brief behavior
- Shift schedule planning
- Backend module registration, agent tool policy, and trigger registration



