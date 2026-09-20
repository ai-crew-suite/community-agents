# Scaffolder AI Drift Detector Implementation Plan

## Overview

This plugin continuously scans repositories created via software templates to identify deviations, outdated configurations, and non-compliant pattern drift over time.

- **The Task**: Detecting, analyzing, and auto-remediating variance between a component's original golden-path Scaffolder blueprint and its live, operational infrastructure state.
- **The Logic**: Rather than performing a simple string comparison, a **Stateful Reconciliation Agent** ingests live topology data using the **Kubernetes and Cloud Provider tool packs** and contrasts it against the original Software Template specs stored in PostgreSQL. When structural anomalies or "shadow IT" resources are identified, the graph initializes an evaluation loop. Instead of just failing a check, the agent calculates the technical and financial delta, compiles a remediation patch, and routes it through a **HITL platform gate** allowing engineers to auto-sync the repo infrastructure files back to the golden path with one click.

## Strategic Evaluation

**Is this better done by SaaS tools, and will developers use it?**

_SaaS Product Overlap_

**Yes, there is heavy overlap with specialized tools, but with a critical gap.**
Infrastructure drift detection is natively handled by tools like **Terraform Cloud, Atlantis, or AWS Config**, while Kubernetes configuration drift is dominated by GitOps controllers like **ArgoCD**.

However, SaaS tools suffer from a **context vacuum**. ArgoCD can tell an operator that a Kubernetes deployment has changed, but it has _no idea why_. It does not know who owns the service, what team handles it, what business unit it belongs to, or what the original "golden path" blueprint looked like.

_The Backstage Win_

Your plugin wins because **Backstage is the single source of context.** By anchoring drift detection inside your monorepo platform, your agent can uniquely cross-reference live infrastructure drift with the **Backstage Org Graph and Catalog Metadata**:

- When a SaaS tool alerts, it goes to a generic platform engineering Slack channel.
- When _your_ agent detects drift, it identifies the exact `spec.owner` from the Backstage catalog, looks up the team's active channel via the **Slack tool pack**, and sends a targeted, context-rich notification directly to the developers responsible.

_Will Users Actually Use It?_

- **Platform Engineers / SREs**: **Absolutely.** This solves their biggest headache: developers spinning up non-compliant, unmonitored resources after a project is scaffolded. A centralized Backstage dashboard showing compliance drift across all microservices is an enterprise platform team's holy grail.
- **Product Developers**: They will not interact with it actively. Instead, they will consume its output passively when the agent opens an automated, easy-to-merge Pull Request fixing a misconfigured file in their repository to bring them back into compliance.

## Goal

Implement `@ai-crew-suite/plugin-agent-scaffolder-drift-detector-backend` as an AI Core backend module that continuously reconciles a component's **live infrastructure state** (Kubernetes + cloud topology) against its original **golden-path Scaffolder blueprint**. Instead of static pass/fail checks, it computes the technical **and** financial drift delta, compiles a remediation patch, and routes it through a **human-in-the-loop (HITL) approval gate** so an engineer can auto-sync the repo's infrastructure files back to the golden path with one click. A paired frontend shows the drift dashboard and the one-click remediate flow.

Reuse the architecture proven by `plugin-ai-agent-backend-catalog-ai-insights` (its `_IMPLEMENTATION.md` is the source of truth for repository conventions, workflow-runner mechanics, event contracts, monorepo wiring, and test-layer definitions). This plan documents only what differs: **live-vs-blueprint reconciliation**, drift delta/patch computation, persistent drift-state tracking across scans, and an approval-gated remediation PR write.

## Delivery Boundary

### In scope

- Run a **scheduled** fleet-wide drift sweep and an **on-demand** per-component drift check, via `/agents/scaffolder-ai-drift-detector/runs`.
- Deterministic reconciliation: ingest live state → load golden-path blueprint → compute delta → compile remediation patch → HITL approval gate → (approved) open remediation PR.
- Bounded reads: Kubernetes workload snapshots, cloud resource topology, repo infra files (`main.tf`/`deployment.yaml`), catalog annotations — all through registered read-only AI Core tools.
- Deterministic structural diff (replicas, resource limits, image, shadow resources); the LLM only computes the human-readable delta narrative and the patch, it does not decide what counts as drift.
- A structured, citation-required `DriftReport` + `RemediationPatch` artifact, persisted drift-state records, and an `approval_request` before any PR write.
- A frontend drift dashboard (fleet compliance view), per-component drift detail, diff/patch preview, and approve/reject remediate control.

### Explicitly out of scope for v1

- **Autonomous remediation.** The sync PR opens only after a human `approved` decision; scheduled sweeps pause at the patch/approval gate and never modify clusters or repos.
- Mutating live clusters/cloud directly (no `kubectl apply`, no cloud writes). Remediation is a **repo PR**, never an imperative infra change.
- Targeted Slack notification to the component owner (`communication.message.post`) — deferred to v1.1 behind approval; v1 surfaces drift via the dashboard/artifact.
- Blueprint authoring or template editing; the agent only reads golden-path specs.

## Required Prerequisites

Contracts verified against the current codebase. As with the catalog plan: no fictional service refs — the foundation doc's `kubernetes.service`/`github.service` `createServiceFactory` sketches (and its bespoke `scaffolder_blueprints` DB table assumption) must not be implemented as written; use registered tool IDs and AI Core persistence.

**Two hard gates:** (a) the cloud-provider module ships **no normalized live-topology tools** (see below); (b) there is **no VCS pull-request-creation write tool** today.

| Capability | Required contract | Current state | Required action |
| --- | --- | --- | --- |
| K8s live topology | `kubernetes.workload.get_snapshot`, `kubernetes.workload.get_timeline`, `kubernetes.pod.get_snapshot` | Exist, `effect: read`; Backstage-aware diagnostics gated by responder Milestone 0 | Same gate; do not duplicate. |
| **Cloud live topology** | `cloud.resource.lookup`, `cloud.resource.dependencies` (**normalized**) | **Broken/legacy** — `createCloudProviderTools` emits LangChain `name`/`execute` tools (provider-prefixed, no `effect`, no `id`/`invoke`); driver ops are all read-only (`lookupAccount`/`lookupResource`/`resourceDependencies`) | Normalize the cloud module to `ToolDefinition` (`id: 'cloud.*'`, `effect: 'read'`, `invoke`) and add any read ops needed for topology capture. **Blocking for cloud reconciliation.** |
| Golden-path blueprint | Component's scaffolder origin + template spec | **No shared helper** — `plugin-ai-core-node/src/scaffolder/` (ScaffolderWorkflowService) is unbuilt | Add a bounded `getComponentBlueprint`/template-spec read in core (shared with other scaffolder-* plugins); adapter here reads the catalog entity's scaffold provenance + template source. |
| Repo infra files | `coreServices.urlReader`, `vcs.repository.read_file` | Exist | Read live `main.tf`/`deployment.yaml` to isolate file-level drift. |
| Financial delta | `compliance.cost.estimate` | Exists, `effect: read` (compliance module, OPA driver) | Compute $ impact of the drift delta; degrade when no driver. |
| Catalog targets/annotations | `CatalogEntityResolver` (shared) | **Still unbuilt** (`plugin-ai-core-node/src/catalog/`) | Reuse when landed; else read `backstage.io/kubernetes-id` / cloud annotations via `catalogServiceRef` adapter here. |
| **Remediation PR (write)** | `vcs.pull_request.create` (**new, `effect: 'write'`**) | **Not present** — all `vcs.*` are `effect: read` | Add `createPullRequest(repoUrl, branch, title, body, files)` to `VcsDriver` + a `vcs.pull_request.create` tool (`effect: 'write'`). **Blocking for the remediate milestone.** |
| HITL approval gate | `ApprovalRequest`/`ApprovalDecision`, `WorkflowRunner.resume()`, `CheckpointStore`, `AuditLogSink` | **Exist** | Emit `approval_request` before the PR; checkpoint; `resume()` opens or discards; audit the decision. |
| Persistent drift state across scans | AI Core runtime stores (checkpoints/runs/artifacts) | Exist | Track per-component drift via run/checkpoint records; do **not** hand-roll a bespoke `scaffolder_blueprints` table in v1 (avoid duplicate evaluation threads; a scan looks up the prior drift record). |
| Scheduled sweep | `coreServices.scheduler` + `discovery` + `auth` | Available | In-module periodic dispatch of per-component runs. |

## Package Shape

Backend module from the same template as catalog-ai-insights; only the domain directories differ:

```text
plugins/backend/plugin-ai-agent-backend-scaffolder-ai-drift-detector/
  package.json          # role: backend-plugin-module, pluginId: ai-core
  tsconfig.json
  config.d.ts
  README.md
  src/
    index.ts
    module.ts           # registers runner, agent, triggers, scheduler sweep
    agent.ts            # DRIFT_DETECTOR_AGENT_ID, tool allow-list, system prompt
    config.ts           # readDriftDetectorConfig (ai.agents.driftDetector)
    workflow/
      DriftGraph.ts             # WorkflowRunner id 'scaffolder-drift' (run + resume)
      state.ts                  # DriftState (blueprint + live snapshot + delta + patch)
      blueprint.ts              # golden-path spec loading via Scaffolder helper
      liveState.ts              # K8s + cloud + repo-file live topology -> InfraSnapshot
      delta.ts                  # deterministic structural diff -> DriftItem[]
      patch.ts                  # remediation patch (unified diff per infra file) + cost delta
      remediate.ts              # approval-gated vcs.pull_request.create step
    scheduler/
      fleetSweep.ts             # coreServices.scheduler registration (e.g. every 24h)
      sweepPlanner.ts           # pure: catalog scan -> bounded per-component dispatch plan
    services/
      BlueprintResolver.ts      # Scaffolder helper adapter -> golden-path spec
      DriftStateStore.ts        # per-component drift tracking via runtime stores
      DriftToolRunner.ts        # capped invokeTool facade
      DriftArtifactWriter.ts
    __tests__/
    workflow/__tests__/
    scheduler/__tests__/
    services/__tests__/
```

- `createBackendModule` with `pluginId: 'ai-core'`, `moduleId: 'agent-scaffolder-ai-drift-detector'`.
- `module.ts` deps: `coreServices.rootConfig`, `logger`, `scheduler`, `discovery`, `auth`, `catalogServiceRef`, `urlReader`, plus `agentExtensionPoint`, `triggerExtensionPoint`, `workflowRunnerExtensionPoint`.
- Package naming, scripts, Apache header, root `tsconfig.json` references, and `.eslintrc.cjs` role overrides follow catalog-ai-insights and `plugin-registration.md` verbatim (not repeated here).

## Monorepo And App Wiring

Same delegated-but-verified steps as catalog-ai-insights (see that plan's "Monorepo And App Wiring"). Deltas:

- **Backend load**: add `"@ai-crew-suite/plugin-agent-scaffolder-drift-detector-backend": "workspace:^"` to `packages/backend/package.json` and the matching `backend.add(loadBackendFeature(import(...)))` in `packages/backend/src/index.ts`.
- **Cloud + VCS module gates**: reconciliation needs the normalized `cloud.*` tools; remediation needs the new `vcs.pull_request.create` write tool. Both modules must be extended and loaded before those milestones are enabled. Drift-detection-only runs (read path, no PR) work without the VCS write.
- **App config**: throws at boot without `ai.agents.driftDetector.model`; add the config block (see Configuration). Remediation additionally requires `ai.agents.driftDetector.remediate.enabled: true`.
- **Frontend registration**: add `"@ai-crew-suite/plugin-agent-scaffolder-drift-detector": "workspace:^"` to `packages/app/package.json`, import its `/alpha` default export in `packages/app/src/App.tsx`, and extend plugin-ID expectations in `packages/app/src/App.test.tsx`.
- **Yarn PnP refresh**: `yarn install`, then `yarn typecheck --force` / `yarn lint --force`.

## Agent Definition

```ts
{
  id: 'scaffolder-ai-drift-detector',
  modelRef: config.modelRef,          // installation-registered ID, e.g. 'drift-detector'
  workflowRef: 'scaffolder-drift',
  memory: 'none',                     // each reconciliation is a fresh live-vs-blueprint snapshot
  systemPrompt: DRIFT_DETECTOR_SYSTEM_PROMPT,
  toolIds: [
    'kubernetes.workload.get_snapshot',
    'kubernetes.workload.get_timeline',
    'kubernetes.pod.get_snapshot',
    'cloud.resource.lookup',
    'cloud.resource.dependencies',
    'vcs.repository.read_file',
    'compliance.cost.estimate',
    'knowledge.retrieve',
    'vcs.pull_request.create',        // effect: 'write' — NEW; only invoked post-approval
  ],
  triggers: [
    { id: 'drift-check-on-demand', source: 'manual', agentId: 'scaffolder-ai-drift-detector' },
    { id: 'drift-fleet-sweep', source: 'scheduler', agentId: 'scaffolder-ai-drift-detector' },
  ],
}
```

- Read tools run freely. The single write tool `vcs.pull_request.create` is `effect: 'write'`, so AI Core pauses with an `approval_request` before it runs — the plugin must not bypass this. Omit it from the allow-list until it lands; the workflow then terminates at the patch artifact (detect-only mode).
- Cloud tools are optional until the cloud module is normalized; absent cloud topology is recorded as a limitation (K8s-only reconciliation still works).
- System prompt rules: compute drift only by contrasting the supplied blueprint with the supplied live snapshot; cite `live-N`/`bp-N` evidence IDs for every drift item; never fabricate resource counts, costs, or template values; produce the patch as a precise unified diff against the named files only; say "no drift" when snapshots match.

## Run Input Contract

The generic `AgentRunInput.input.query` carries a versioned JSON payload:

```ts
type DriftCheckRequest = {
  version: 1;
  source: 'manual' | 'scheduler';
  entityRef: string;            // required: the scaffolded component, 'component:default/payment-processor'
  repoUrl?: string;            // override; else derived from catalog source-location annotation
  infraPaths?: string[];       // infra files to diff, default ['main.tf','deployment.yaml','k8s/**']
  remediate?: boolean;          // request the remediation PR path (still gated); default false
};
```

Validation requires `entityRef` (or a fleet sweep dispatching per-component requests), bounds `infraPaths` count/size, and forces the remediate path through the approval gate regardless of caller.

## Reconciliation Workflow

`DriftGraph` registers as `WorkflowRunner` id `scaffolder-drift` and implements **both** `run()` and `resume()`. It realizes the foundation doc's loop: **Ingest Live State → Load Scaffolder Blueprint → Delta & Patch Analysis → HITL Approval Gate → Commit Auto-Sync**. The diff is deterministic; the LLM narrates and patches, never decides drift.

### Deterministic graph nodes

1. **blueprint.load** — validate `DriftCheckRequest`; resolve the component via `BlueprintResolver` → golden-path spec (`bp-N` evidence items: expected replicas, resource limits, image, declared resources). No scaffold provenance → terminal `error`, no model call.
2. **livestate.ingest** — capture a bounded `InfraSnapshot` of live state (`live-N` evidence items) via `DriftToolRunner`: `kubernetes.workload.get_snapshot`/`get_timeline`/`pod.get_snapshot`, optional `cloud.resource.lookup`/`resource_dependencies`, and repo infra files via `vcs.repository.read_file`/`urlReader`. Absent sources → limitations, empty slots.
3. **delta.compute** — **deterministic** structural diff (`delta.ts`): compare blueprint vs snapshot per field (replicas, `resources.limits`, image tag, env, shadow/unexpected cloud resources). Produces `DriftItem[]` with `field`, `expected` (cites `bp-N`), `actual` (cites `live-N`), `severity`. **No LLM here** — matches the foundation doc's "isolate the divergence" requirement (e.g. replicas 6 vs 2).
4. **patch.compile** — when drift is non-empty and `remediate` requested: one model call computes a per-file unified diff bringing infra files back to the golden path, plus a financial delta via `compliance.cost.estimate`. The patch is **validated to apply cleanly** against the read files before gating; invalid patches degrade to detect-only with a limitation. Emits `drift-report` (+ optional `remediation-patch`) artifacts.
5. **approval.gate** — if `remediate` and a valid patch exists and `vcs.pull_request.create` is available and `remediate.enabled`, emit `approval_request` (`effect: 'write'`), checkpoint, **suspend**. Sweeps and detect-only runs finish at the report artifact.
6. **remediate** *(resume path)* — `resume(runId, decision, context)`: on `approved`, open the sync PR via `vcs.pull_request.create`, emit `remediation-publication` artifact + audit, then `done`; on `rejected`, record the decision, mark drift `acknowledged` in state, finalize without a PR.

### State and output schema

```ts
type EvidenceRef = { id: string; source: 'blueprint' | 'live' | 'cost' | 'knowledge'; summary: string; reference?: string };

type DriftItem = {
  id: string;                     // 'drift-1' ...
  field: string;                  // 'spec.replicas' | 'resources.limits.memory' | 'spec.template.spec.containers[0].image' | ...
  expected: { value: unknown; evidence: string[] };  // bp-N
  actual: { value: unknown; evidence: string[] };    // live-N
  severity: 'critical' | 'major' | 'minor' | 'info';
  financialDeltaUsd?: number;     // from compliance.cost.estimate
};

type InfraSnapshot = {            // live state, bounded + redacted
  k8s?: { replicas?: number; resources?: unknown; image?: string; extraPods?: string[] };
  cloud?: { resources: { type: string; id: string }[]; shadowResources?: string[] };
  files?: { path: string; content: string }[];      // read infra files
};

// DriftState: { request, blueprint, snapshot, items: DriftItem[],
//   patch?: FilePatch[], costDelta?: number, limitations: string[],
//   status: 'in_sync'|'drifted'|'acknowledged'|'partial' }

type DriftReport = {
  entityRef: string;
  status: 'in_sync' | 'drifted' | 'partial' | 'insufficient_evidence';
  items: DriftItem[];
  costDeltaUsd?: number;
  limitations: string[];
  evidence: EvidenceRef[];        // bp-N + live-N bundle
};

type FilePatch = { path: string; diff: string };    // unified diff, validated to apply

type RemediationPatch = {
  entityRef: string;
  repoUrl: string;
  branch: string;
  title: string;
  body: string;
  files: FilePatch[];
  driftRef: string;               // artifact ref of the DriftReport it remediates
};
```

## Drift-State Persistence Across Sweeps (New Structural Section)

The foundation doc requires unresolved drift to be tracked for days without duplicate evaluation threads.

- `DriftStateStore.ts` tracks per-component drift using the **AI Core runtime stores**, not a bespoke DB table: each component's latest drift is a run artifact keyed by `entityRef`; active (un-remediated) drift is a checkpoint record.
- A scheduled sweep, before dispatching a component run, queries the prior drift record: if drift is unchanged since the last scan (same `DriftItem[]` fingerprint), it updates metrics/timestamps on the existing record and **does not** spawn a new evaluation run or open a duplicate approval; if drift changed, it supersedes the prior record and starts a fresh run.
- This satisfies the foundation doc's "consecutive scans update metrics without spawning duplicate evaluation threads or clearing the active tracking ID" requirement using existing persistence, avoiding the foundation doc's hand-rolled `scaffolder_blueprints` table.

## Background Scheduler Tasks (Fleet Sweep)

- `scheduler/fleetSweep.ts` registers one `coreServices.scheduler` task for the periodic fleet audit:
  - `id: 'drift-detector-fleet-sweep'`, `frequency: { cron }` from config (default `0 */24 * * *`), bounded `timeout`, non-zero `initialDelay`, `scope: 'global'`.
- Task flow: `sweepPlanner.ts` (pure) lists scaffolded Components (those with scaffold provenance + `backstage.io/kubernetes-id`/cloud annotations), caps at `maxSweepComponents`, and emits a dispatch plan. The task consults `DriftStateStore` to skip components whose drift fingerprint is unchanged, then POSTs one run per remaining component to `/agents/scaffolder-ai-drift-detector/runs` via `auth.getPluginRequestToken` + `discovery.getBaseUrl('ai-core')`, `source: 'scheduler'`, `remediate: true`. It never runs the graph in-process.
- **Sweep runs stop at the patch/approval gate and never open a PR autonomously** — each component's remediation still needs a human approve. This is the "self-healing with a HITL gate" posture, not auto-apply.
- Guardrails: per-sweep component cap, sequential dispatch with delay, skip when a sweep is in flight (mutex), per-component dedupe via drift fingerprint, config kill switch `sweep.enabled` (default **false**).

## Vector Store Integration

- **No new vector infrastructure.** RAG is a secondary path: `knowledge.retrieve` can enrich drift items with the golden-path template's intent/docs so the patch narrative explains *why* the blueprint expects a value. Indexing/storage stay owned by `plugin-ai-core-backend-module-retrieval-augmenter`; runtime/drift state by `plugin-ai-core-backend-module-runtime-store`.
- Retrieval never affects the deterministic `delta.compute` verdict (what counts as drift); it only conditions the patch/narrative. Tests mock `context.invokeTool` for `knowledge.retrieve` with pre-baked golden-path-doc fixtures.

## Configuration

```yaml
ai:
  agents:
    driftDetector:
      model: drift-detector       # installation-registered model ID, required
      maxInfraFiles: 8            # optional, default 8
      maxDriftItems: 40           # optional, default 40
      maxToolInvocations: 18      # optional, default 18
      infraPaths:                 # optional; files diffed by default
        - 'main.tf'
        - 'deployment.yaml'
        - 'k8s/**'
      sweep:
        enabled: false            # optional, default false
        cron: '0 */24 * * *'      # optional, default every 24h
        maxSweepComponents: 50    # optional, default 50
      remediate:
        enabled: false            # optional, default false; gates vcs.pull_request.create
```

`config.ts` mirrors `readCatalogAiInsightsConfig`: throw when the section or `model` is absent; document all defaults in `config.d.ts`. Remediation requires **both** `remediate.enabled: true` and the `vcs.pull_request.create` tool being registered.

## Shared AI-Core Work To Build First

- **Cloud-provider tool normalization (blocking for cloud reconciliation)** — rewrite `createCloudProviderTools` to emit `ToolDefinition`s (`id: 'cloud.*'`, `effect: 'read'`, `invoke`) instead of legacy LangChain `name`/`execute` tools, and keep all driver ops read-only. This module is the first consumer; `search-ai-archeology` / `scaffolder-ai-shadow-detective` will reuse the normalized cloud tools.
- **VCS pull-request-creation write (blocking for remediate)** — add `createPullRequest(repoUrl, branch, title, body, files)` to `VcsDriver` and register `vcs.pull_request.create` (`effect: 'write'`) in `plugin-ai-core-backend-module-vcs`. Shared with future self-healing/drift PR workflows.
- **Scaffolder blueprint helper (shared)** — add a bounded blueprint/template-spec read to `plugin-ai-core-node/src/scaffolder/` (the `ScaffolderWorkflowService` contract the responder plan anticipated); this plugin is its first consumer. No task execution, only reading provenance + golden-path spec.
- **`CatalogEntityResolver` (shared, still unbuilt)** — reuse when landed for annotation/entity resolution; else a local `catalogServiceRef` adapter.
- **No new approval/persistence machinery** — approval types/`resume()`/checkpoint/audit/runtime stores all exist; this plugin exercises the write-approval path (second after release-notes) and the runtime-store drift tracking without replacing either.

## Frontend Plan

Mirror the catalog-ai-insights frontend layout and wiring (`alpha.ts`, `extensions/`, self-contained wire types in `@types/`, SSE client over `discoveryApi.getBaseUrl('ai-core')` with `eventsource-parser` and `Last-Event-ID` replay). The distinguishing UI is the **fleet drift dashboard** + per-component diff/patch + one-click remediate.

```text
plugins/frontend/plugin-ai-agent-frontend-scaffolder-ai-drift-detector/
  src/
    index.ts
    alpha.ts
    plugin.ts
    routes.ts                     # rootRouteRef for the drift dashboard page
    @types/index.ts               # DriftCheckRequest/DriftReport/RemediationPatch wire types
    api/
      apiRef.ts
      client.ts                   # DriftDetectorClient: checkDrift(), streamRunEvents(), submitApproval(), listDrift()
      index.ts
    hooks/
      useDriftRun.ts              # pure reducer + hook (check/approve/reject/reset)
      useDriftList.ts             # fleet drift dashboard data from recent runs
    components/
      index.ts
      DriftDashboardPage.tsx      # standalone: fleet compliance view + on-demand check
      DriftDashboardTable.tsx     # per-component status/severity/cost, deep links
      RunDriftCheckDialog.tsx     # entityRef/infraPaths/remediate inputs
      DriftRunView.tsx            # live node/tool progress from SSE
      DriftItemList.tsx           # per-field drift with expected vs actual + citations
      PatchPreview.tsx            # unified-diff viewer per infra file + cost delta
      ApprovalBar.tsx             # approve/reject the sync PR
      RemediationBanner.tsx       # opened-PR link on success
    extensions/
      api.ts
      components.ts
    __tests__/
```

Frontend deltas vs catalog-ai-insights:

- `backstage.pluginId: 'scaffolder-ai-drift-detector'`; package `@ai-crew-suite/plugin-agent-scaffolder-drift-detector`.
- Primary surface is a **fleet dashboard page** (nav item) listing component drift status; a per-entity card links the component's own drift record.
- `checkDrift()` POSTs `/agents/scaffolder-ai-drift-detector/runs` with the JSON `DriftCheckRequest`; the report renders from the `drift-report` artifact; `PatchPreview` renders `remediation-patch` diffs.
- **Approval UX**: on `approval_request`, `ApprovalBar` approves/rejects; `submitApproval()` posts an `ApprovalDecision`; on approve `RemediationBanner` links the opened sync PR; on reject the drift shows as `acknowledged`.
- `status: 'in_sync'` renders as compliant; severity and `costDeltaUsd` are the dashboard sort keys; every drift item shows expected-vs-actual with `bp`/`live` citations.

## Test Strategy

Reuse the catalog plan's test-layer table and network policies. Deltas only:

- **Unit**: `delta.ts` structural diff (replicas 6 vs 2, resource-limit divergence, image drift, shadow cloud resources); `patch.ts` unified-diff generation + apply-cleanly validation; `sweepPlanner.ts` bounding + fingerprint skip; `blueprint.ts` parsing.
- **Reconciliation tests (headline)**: drive `DriftGraph.run()` with a stubbed `WorkflowContext` `invokeTool` mock router keyed by `toolId`+args — the codebase-accurate replacement for the foundation doc's `kubernetes.service`/`github.service` `createServiceFactory` sketch. Signature scenario: blueprint expects `replicas: 2, memory: 512Mi` but live snapshot has `replicas: 6` → the graph isolates the divergence (`drift-1` on `spec.replicas`), computes the cost delta, and compiles a patch **without touching the live cluster**.
- **Approval-gate tests**: run emits `approval_request` and **suspends** before any `vcs.pull_request.create`; checkpoint persisted; `resume('approved')` opens the PR exactly once + audit; `resume('rejected')` marks `acknowledged`, opens nothing; repeated approved resume does not double-open (idempotency by `(entityRef, driftFingerprint)`).
- **Cross-sweep persistence tests**: simulate two consecutive sweeps via the mocked `DriftStateStore`; assert the second sweep updates the existing drift record's metrics and does **not** spawn a duplicate evaluation run or clear the tracking ID (foundation doc's state-persistence requirement).
- **Scheduler tests**: `mockServices.scheduler` fast-forwards to the sweep tick; assert bounded authenticated dispatches, fingerprint-skipping of unchanged components, `sweep.enabled: false` respected, overlap skipped, and **no autonomous PR**.
- **Cloud/K8s isolation**: mock `cloud.*` and `kubernetes.*` with fixture topology; assert cloud absence degrades to K8s-only with a limitation.
- **Backend integration**: `startTestBackend` with this module + AI Core + `mockServices.rootConfig` + `mockServices.database`, asserting boot registration, run→SSE order, checkpoint at the gate, resume flow, and drift-record/artifact persistence.
- **E2E**: extend the shared fixture profile with fixture K8s/cloud/VCS (incl. fixture `vcs.pull_request.create`) + catalog blueprints; Playwright: open dashboard → run a drift check on a drifted fixture component → see the diff + cost delta → approve → assert remediation banner; plus a reject path. Add `yarn test:e2e:drift-detector`.

## Security and Operational Guardrails

Catalog-ai-insights guardrails apply unchanged (identity propagation, redaction, tool/token/wall-clock caps, correlation IDs). Drift-detector-specific additions (write-capable + infra visibility):

- **No remediation PR without a persisted human `approved` decision**; the decision, `decidedBy`, target repo/branch, and patch artifact ref are audit-logged.
- The PR target (repo + branch) and patch files are fixed at gate time and re-validated on resume; the patch is validated to apply before gating.
- Sweep runs carry a service principal and **never** PR authority — every remediation needs a human approve.
- Enforce authorization: only users permitted to open PRs on the component repo may approve; the agent never applies changes to live clusters/cloud (repo-only remediation).
- Redact secrets/tokens from infra files and live snapshots before they enter model context, SSE, artifacts, or audit records; cap file/snapshot sizes.
- Cost estimates come from `compliance.cost.estimate` only; never fabricate dollar figures — absent cost driver → `financialDeltaUsd` omitted with a limitation.

## Ordered Implementation Milestones

### Milestone 0: Shared contracts and schemas

- [ ] Normalize cloud-provider tools to `ToolDefinition` (`cloud.*`, read); confirm K8s tools; extend `VcsDriver` with `createPullRequest` + `vcs.pull_request.create` (write).
- [ ] Build the Scaffolder blueprint helper in `plugin-ai-core-node/src/scaffolder/`; confirm/reuse `CatalogEntityResolver`.
- [ ] Define `DriftCheckRequest`, `InfraSnapshot`, `DriftItem`, `DriftReport`, `FilePatch`, `RemediationPatch`, and the config schema; implement + unit-test `delta.ts`, `patch.ts`, `sweepPlanner.ts`, `blueprint.ts`.

Exit criteria: deterministic diff and patch validation pass on fixtures; schemas validate.

### Milestone 1: Detection backend (read-only)

- [ ] Scaffold package, register runner/agent/manual trigger, config parsing; register in root `tsconfig.json` + `.eslintrc.cjs`.
- [ ] Implement blueprint.load → livestate.ingest → delta.compute → patch.compile → `drift-report` (+ patch) artifacts (no PR yet).
- [ ] Wire into `packages/backend` and add the `ai.agents.driftDetector` config block.
- [ ] Add unit, reconciliation (mock router), and backend integration tests.

Exit criteria: drift detection + patch compile passes deterministically with no real LLM/service and no write tool.

### Milestone 2: Sweep + write approval gate

- [ ] Implement fleet sweep scheduling with fingerprint-dedupe dispatch and guardrails; cross-sweep drift-state persistence via runtime stores.
- [ ] Implement the approval gate: `approval_request`, checkpoint, `resume()` open/discard, audit, idempotency.
- [ ] Sweep + approval-gate tests, including no-duplicate-evaluation and no-double-PR.

Exit criteria: sweeps update drift records without duplicate runs; a PR opens only after `approved`; full run→gate→resume→PR path proven in the test backend.

### Milestone 3: Frontend + E2E

- [ ] Implement the frontend (dashboard, drift check, diff/patch preview, approval bar, remediation banner) and register it in `packages/app`.
- [ ] Component tests (loading, streaming, in-sync/drifted/acknowledged, approval request, approve/reject, replay) + accessibility checks.
- [ ] Extend the E2E fixture profile and add Playwright approve and reject scenarios with screenshot review.

Exit criteria: `yarn test:e2e:drift-detector` demonstrates drift detection → diff/cost → approve → PR and reject → acknowledged in a browser without external infrastructure.

### Milestone 4: Production readiness

- [ ] Document model registration, K8s/cloud/VCS/compliance driver configuration, sweep enablement, remediation permissions, and approval flow.
- [ ] Dashboards/alerts for failed runs, drift-detection rate, sweep coverage/duration, remediation-open rate, and token/cost.
- [ ] Opt-in real-model evaluation suite (grounding: every drift item cites `bp`/`live` evidence; patches apply cleanly; no fabricated resources/costs) within budget.

Exit criteria: staged rollout with sweep + remediate disabled by default, bounded costs, verified approval auditing and diff grounding.

## Definition of Done

- Package, agent, runner (`run` + `resume`), triggers (manual + sweep), config schema, read allow-list, and the gated `vcs.pull_request.create` write tool implemented and registered (root + app/backend + cloud/VCS-module + core Scaffolder-helper wiring included).
- Runs execute through the real AI Core controller/runtime with persisted replayable events, checkpoints at the gate, token/cost usage, and `drift-report` / `remediation-patch` / `remediation-publication` artifacts.
- Deterministic diff provably isolates divergence (blueprint vs live) and never mutates live infrastructure; cross-sweep drift state persists without duplicate evaluation threads.
- Sweeps are detect-only/draft; the approval gate provably blocks the sync PR until an `approved` decision and never double-opens; frontend renders the dashboard, diff/cost, and approve/reject over live SSE and replay; Playwright verifies both paths.
- No output surface (SSE, artifacts, logs, audit, tests) contains secrets, uncited model claims, fabricated costs, or a PR write lacking a recorded human approval.

## Frontend Completed

Implemented the contract-matched frontend at:

`/home/kevin/Repos/backstage/ai-crew-suite/plugins/frontend/plugin-ai-agent-frontend-scaffolder-ai-drift-detector`

### Implemented surface

- Package `@ai-crew-suite/plugin-agent-scaffolder-drift-detector`
  with `frontend-plugin` role, legacy entrypoint, and `./alpha` entrypoint.
- Standalone `/scaffolder-ai-drift-detector` page with `?run=<id>` replay.
- Typed AI Core client: start drift check, replay run events with
  `Last-Event-ID`, typed future approval submission.
- Temporary bounded blueprint form (entity reference, replicas, image), required
  because the shared Scaffolder blueprint reader is not implemented yet.
- `useDriftRun` reducer/hook, progress/replay handling, expected-versus-actual
  drift items with paired `bp`/`live` evidence, status, limitations, and report
  evidence.

### Contract limitation (not fabricated)

The implemented backend emits **only** `drift-report`; it exposes no fleet-list
endpoint, remediation patch artifact, approval event, publication artifact, or
VCS write tool. Consequently this frontend intentionally does not invent the
plan's fleet dashboard API, patch preview, approval/reject button, or PR link.
Those UI paths can be added when their real backend contracts land.

## Backend Completed

### Implemented

- Package, config schema, AI Core module, agent, manual/scheduler trigger
  registration, root/app backend wiring, and `driftDetector` app config.
- Custom `scaffolder-drift` workflow and `scaffolder-ai-drift-detector` agent.
- Deterministic `drift-report` artifact for a caller-supplied bounded golden-path
  blueprint compared with a Kubernetes workload snapshot.
- Deterministic structural diffs for replicas, image, CPU limit, and memory
  limit, with paired `bp-1` and `live-1` citations.
- Bounded `kubernetes.workload.resolve` / `kubernetes.workload.get_snapshot`
  execution with explained `insufficient_evidence` outcomes when a blueprint,
  workload, or snapshot is unavailable.
- `partial` only when a runtime read tool fails; known unavailable future
  capabilities remain prominent limitations without invalidating a complete
  Kubernetes comparison.

### Contract limitations (not fabricated)

The plan requires three shared contracts that do not exist in this repository:

- normalized `cloud.resource.lookup` / `cloud.resource.dependencies` tools
- a shared Scaffolder blueprint/provenance reader
- `vcs.pull_request.create` (`effect: 'write'`)

Accordingly, cloud reconciliation, catalog-derived blueprint loading, remediation
patches, approval requests, checkpoints, `resume()`, PR writes, persistent
cross-sweep fingerprint state, and fleet scheduler dispatch were not fabricated.
The module is explicitly Kubernetes-backed, detect-only, and advisory. The
configuration retains future sweep/remediation fields but they are not activated
until the shared contracts land.

### Wiring added

- `/home/kevin/Repos/backstage/ai-crew-suite/tsconfig.json`
- `/home/kevin/Repos/backstage/ai-crew-suite/.eslintrc.cjs`
- `/home/kevin/Repos/backstage/ai-crew-suite/packages/backend/package.json`
- `/home/kevin/Repos/backstage/ai-crew-suite/packages/backend/src/index.ts`
- `/home/kevin/Repos/backstage/ai-crew-suite/app-config.yaml`
- `/home/kevin/Repos/backstage/ai-crew-suite/yarn.lock`
