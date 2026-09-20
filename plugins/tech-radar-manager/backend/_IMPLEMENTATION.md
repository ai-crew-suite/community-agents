# Tech Radar AI Manager Implementation Plan

## Overview

This plugin continuously scans internal repositories and software lifecycle telemetry to automatically recommend status promotions or deprecations on your company's Technology Radar.

- **The Task:** Maintaining the Backstage Tech Radar.
- **The Logic:** A **LangGraph** agent monitors all new PRs and `package.json` changes across the organization.
  - **Deprecation & Security Drift Tracking**: If a library is moved to the "Hold" or "End of Life" quadrant on your radar, the agent can scan all repositories, flag components still utilizing it, and automatically open tracking issues for the respective software owners.
  - **Library Adoption**: If it sees a sudden spike in a new library (e.g., everyone is suddenly using _Vite_ instead of _Webpack_), it automatically drafts a proposal to move that technology from "Assess" to "Adopt" on the company Tech Radar.
  - **Duplicate Capability Alerts**: If a team introduces an entirely new state-management tool when three others are already widely adopted, the agent can flag the PR and notify the authors (_"We noticed you are introducing X; did you consider using Y, which is currently in our 'Adopt' quadrant?"_).
  - **Quarterly Review Summarizer**: The agent can compile a historical ledger of adoption velocity over the past 90 days, drafting an executive summary for your Architecture Review Board to streamline manual radar updates.

## Goal

Implement `@ai-crew-suite/plugin-agent-tech-radar-manager-backend` as an AI Core backend module that keeps the Technology Radar honest by measuring what the organization *actually* uses. A scheduled sweep reads the radar source file, enumerates catalog-registered repositories, parses their dependency manifests, and computes **deterministic adoption ratios** per technology. Crossing a configured threshold drafts a ring-promotion proposal (Vite at 30%+ of manifests: `assess → trial`); a dependency still present in a `hold`/EOL ring produces per-owner deprecation findings. Every proposal cites the exact repositories counted. A paired frontend plugin renders the proposal dashboard, adoption evidence, and the quarterly review summary.

Reuse the architecture proven by `plugin-ai-agent-backend-catalog-ai-insights` (its `_IMPLEMENTATION.md` is the source of truth for repository conventions, workflow-runner mechanics, event contracts, monorepo wiring, and test-layer definitions). This plan documents only what differs: **deterministic adoption measurement**, **longitudinal observation persistence**, **radar-source parsing**, and an **approval-gated proposal submission**.

## Delivery Boundary

### In scope

- A scheduled fleet sweep plus an on-demand scan, via `/agents/tech-radar-ai-manager/runs`.
- Deterministic `radar.load → enumerate → scan → measure → propose → gate` pipeline. Manifest parsing, adoption ratios, ring-transition decisions, and deprecation matching are pure code; the model only writes proposal prose and the executive summary.
- Bounded reads: the radar source via `coreServices.urlReader`/`vcs.repository.read_file`, repository targets via `CatalogEntityResolver`, manifests via `vcs.repository.search`/`read_file`, and `knowledge.retrieve` for architecture-policy context.
- A `RadarAnalysis` artifact carrying per-technology adoption counts, proposed ring transitions, and deprecation findings — every number traceable to the repositories that produced it.
- **Aggregate observation snapshots** persisted per sweep so adoption *velocity* (90-day trend) is computed from real history rather than a single point.
- Approval-gated submission via `quality.scorecard.submit_radar_proposal`, plus optional approval-gated deprecation tickets via `project.ticket.create`.

### Explicitly out of scope for v1

- **Autonomous radar changes.** No proposal is submitted and no ticket filed without a persisted human approval; both write paths default to disabled. The Architecture Review Board decides; the agent drafts.
- **Editing the radar source file directly.** The plugin submits *proposals* through the driver; it never commits to `radar-data.json`. Rewriting the radar from a heuristic would remove the human governance the radar exists to encode.
- **PR-time duplicate-capability alerts.** The foundation doc's "we noticed you're introducing X" flow needs an event subscription that does not exist (see Prerequisites); the same detection runs in the sweep instead, without per-PR commentary.
- Transitive dependency analysis, lockfile resolution, or actual runtime usage. v1 counts **declared direct dependencies** in manifests and says so — a package in `package.json` is not proof of use.
- Language/ecosystem coverage beyond configured manifest parsers (`package.json`, `go.mod`, `requirements.txt`); unparsed ecosystems are reported as coverage gaps, not silently omitted.
- Security/CVE judgments; `hold` membership comes from the radar, not from vulnerability inference.

## Required Prerequisites

Contracts verified against the current codebase. As with the catalog plan: no fictional service refs — the foundation doc's `github.service` sketch (`searchManifests`) must **not** be implemented as written.

**Two of the earlier draft's four gates are disproved; two are confirmed.** It listed a "radar write API", "project ticket write tool", "durable longitudinal metrics store", and "events subscription" as all missing. Verified reality:

- **Radar write — EXISTS, but the driver is a stub.** `quality.scorecard.submit_radar_proposal` is registered `effect: 'write'` with `TechRadarProposalInput = { quadrantId, ringId, title, description, reason }`. However `TechRadarDriver.submitRadarProposal` stores into a per-instance `private readonly draftProposals = new Map()`, reads `techRadar.url` from config **without ever writing to it**, and returns a synthetic `prop-<uuid>`. The tool call succeeds while the proposal **evaporates on restart** — more dangerous than a missing tool, because it looks like it worked.
- **Ticket write — EXISTS.** `project.ticket.create` is `effect: 'write'` with `CreateTicketInput` supporting `title`/`description`/`team`/`labels`/`priority`, so deprecation tickets are buildable today.
- **Longitudinal store — CONFIRMED MISSING.** `ArtifactSink` is write-only (`record(artifact)`) and `SqlAgentRuntimeStore` exposes no artifact query — no `listArtifacts`, no cross-run lookup. Trend analysis has no queryable substrate.
- **Events subscription — CONFIRMED MISSING.** Zero references to `coreServices.events` / `eventsServiceRef` / `EventsService` anywhere.

| Capability | Required contract | Current state | Required action |
| --- | --- | --- | --- |
| Radar source read | `coreServices.urlReader`, `vcs.repository.read_file` | **Exist** | Read and parse `radar-data.json`/`radar.yaml` into `RadarEntry[]`. This is the authoritative ring/quadrant state — never inferred. |
| Repository targets + owners | `CatalogEntityResolver` (`findByAnnotation`, `getIntegrationReferences`, `owner`) | **Exists** in `plugin-ai-core-node/src/catalog/` | Replaces the foundation doc's raw `'://github.com'` parsing; supplies the owner for deprecation routing. |
| Manifest discovery + read | `vcs.repository.search`, `vcs.repository.read_file` | **Exist**, `effect: read`. **Driver quality uneven** — GitHub/GitLab/Azure implement real search; Bitbucket/Gerrit/generic Git return `[]` after a warning | Replaces the invented `searchManifests`. A repo on a stub driver is `manifest_unavailable` and **excluded from the denominator** — counting it as "not using X" would silently understate every adoption ratio. |
| **Radar proposal submission** | `quality.scorecard.submit_radar_proposal` (`effect: 'write'`) | **Tool exists; driver is in-memory only** — `Map`-backed, lost on restart, never persisted to `techRadar.url` | Allow-list behind the approval gate, but treat delivery as unproven: record the returned `proposalId`, attach a `proposal_not_durable` limitation when the active driver is `tech-radar`, and never present submission as durable. **Blocking for real radar integration**; see Shared Work. |
| **Deprecation tickets** | `project.ticket.create` (`effect: 'write'`) | **Exists** | One ticket per affected owner, approval-gated, deduped by `(technology, owner, ring)`. |
| Architecture policy context | `knowledge.retrieve` | Exists | Optional prose for the proposal `reason` and the executive summary. **Never** sets a ratio or a ring decision. |
| **Longitudinal observations** | A queryable per-sweep aggregate store | **Missing** — `ArtifactSink.record()` is write-only; no artifact query on the runtime store | v1 persists `AdoptionSnapshot` aggregates as artifacts **and** keeps a compact rolling series in a plugin-owned checkpoint keyed by a stable `observationSeriesId`, so velocity works without a new core contract. Adding `listArtifacts` to core is the clean long-term fix. |
| Resumable sweeps | `CheckpointStore` + `WorkflowRunner.resume()` | **Exist** | Checkpoint the scan pointer **and accumulated counters** after every repository — the foundation doc's §2 requirement (interrupted at repo 50 of 100, resume without losing counters). |
| **PR-time alerts** | An events subscription | **Missing entirely** | Deferred. Duplicate-capability detection runs in the sweep; keep `RadarScanRequest.source` discriminated so an `event` variant is additive later. |
| Scheduled sweeps | `coreServices.scheduler` + `discovery` + `auth` | Available | Weekly cadence (foundation doc: Sunday night), opt-in and globally mutexed. |

## Package Shape

Backend module from the same template as `catalog-ai-insights`; only the domain directories differ. Every directory carries a barrel `index.ts` re-exporting its public surface, matching the reference plugin's export styling.

```text
plugins/backend/plugin-ai-agent-backend-tech-radar-ai-manager/
  package.json          # role: backend-plugin-module, pluginId: ai-core
  tsconfig.json
  config.d.ts
  README.md
  src/
    index.ts            # barrel: module default + public types
    module.ts           # registers runner, agent, triggers, scheduler sweep
    agent.ts            # TECH_RADAR_MANAGER_AGENT_ID, tool allow-list, system prompt
    config.ts           # readTechRadarManagerConfig (ai.agents.techRadarManager)
    workflow/
      index.ts          # barrel
      RadarGraph.ts             # WorkflowRunner id 'tech-radar-analysis' (run + resume)
      state.ts                  # RadarState (radar, targets, counters, cursor)
      radarSource.ts            # pure: radar file text -> RadarEntry[]
      manifests.ts              # pure: manifest text -> DeclaredDependency[]
      measure.ts                # pure: counters -> AdoptionMetric[] (ratios, velocity)
      transitions.ts            # pure: metric + radar ring -> RingTransitionProposal[]
      deprecations.ts           # pure: hold-ring entries + usage -> DeprecationFinding[]
      analysis.ts               # RadarAnalysis schema, validation, degradation
      submit.ts                 # approval-gated proposal + ticket executor
    observations/
      index.ts          # barrel
      ObservationSeries.ts      # rolling AdoptionSnapshot series (checkpoint-backed)
      velocity.ts               # pure: snapshot series -> 90-day trend + direction
    scheduler/
      index.ts          # barrel
      weeklySweep.ts            # coreServices.scheduler registration (Sun night)
      sweepPlanner.ts           # pure: catalog targets + caps -> bounded scan plan
    services/
      index.ts          # barrel
      RepoTargetResolver.ts     # CatalogEntityResolver adapter: repos + owners
      RadarToolRunner.ts        # capped invokeTool facade, per-repo error classing
      RadarArtifactWriter.ts
    @types/
      index.ts          # barrel: shared radar/metric/proposal contracts
    __tests__/
    workflow/__tests__/
    observations/__tests__/
    scheduler/__tests__/
    services/__tests__/
```

- `createBackendModule` with `pluginId: 'ai-core'`, `moduleId: 'agent-tech-radar-ai-manager'`.
- `module.ts` deps: `coreServices.rootConfig`, `coreServices.logger`, `coreServices.scheduler`, `coreServices.urlReader`, `coreServices.discovery`, `coreServices.auth`, `catalogServiceRef`, plus `agentExtensionPoint`, `triggerExtensionPoint`, `workflowRunnerExtensionPoint`. **No new core service keys are introduced.**
- Package naming, scripts, Apache header, root `tsconfig.json` references, and `.eslintrc.cjs` role overrides follow `catalog-ai-insights` and `plugin-registration.md` verbatim (not repeated here).

## Monorepo And App Wiring

Same delegated-but-verified steps as `catalog-ai-insights` (see that plan's "Monorepo And App Wiring"). Deltas:

- **Backend load**: add `"@ai-crew-suite/plugin-agent-tech-radar-manager-backend": "workspace:^"` to `packages/backend/package.json` and the matching `backend.add(loadBackendFeature(import(...)))` line in `packages/backend/src/index.ts`.
- **Radar driver gate, with a caveat worth reading**: proposal submission needs `plugin-ai-core-backend-module-quality-scorecards` plus the `-techradar` provider. That provider currently persists nothing (in-memory `Map`), so with it loaded the plugin *can* submit but cannot guarantee delivery. The README must state this plainly, and the report carries a `proposal_not_durable` limitation, so nobody concludes the radar was updated.
- **Ticket driver gate**: deprecation tickets need `plugin-ai-core-backend-module-project-management` plus its Jira driver. Absent, findings are reported and ticket targets are `skipped`.
- **VCS driver choice materially changes measurement quality.** On Bitbucket/Gerrit/generic Git, manifest discovery returns `[]`, so those repos are excluded from the denominator rather than counted as non-adopters. Document this: a small scanned subset yields ratios that are correct but unrepresentative.
- **App config**: the module throws at boot without `ai.agents.techRadarManager.model` and `radar.sourceUrl`; add the config block (see Configuration). Sweeps need `sweep.enabled: true`; writes need `propose.enabled` / `tickets.enabled`.
- **Frontend registration**: `plugins/frontend/plugin-ai-agent-frontend-tech-radar-ai-manager/` exists but is **empty** — scaffold it from scratch. Add the workspace dependency to `packages/app/package.json`, import its `/alpha` default export in `packages/app/src/App.tsx`, and extend plugin-ID expectations in `packages/app/src/App.test.tsx`.
- **Yarn PnP refresh**: `yarn install` after any `package.json` edit, then `yarn typecheck --force` / `yarn lint --force`.
## Agent Definition

```ts
{
  id: 'tech-radar-ai-manager',
  modelRef: config.modelRef,          // installation-registered ID, e.g. 'tech-radar-manager'
  workflowRef: 'tech-radar-analysis',
  memory: 'none',                     // fresh measurement each sweep; history via observations
  systemPrompt: TECH_RADAR_MANAGER_SYSTEM_PROMPT,
  toolIds: [
    'vcs.repository.search',
    'vcs.repository.read_file',
    'knowledge.retrieve',
    'quality.scorecard.submit_radar_proposal',  // effect: 'write' — post-approval only
    'project.ticket.create',                    // effect: 'write' — post-approval only
  ],
  triggers: [
    { id: 'radar-scan-on-demand', source: 'manual', agentId: 'tech-radar-ai-manager' },
    { id: 'radar-weekly-sweep', source: 'scheduler', agentId: 'tech-radar-ai-manager' },
  ],
}
```

- Read tools run freely. Both write tools are `effect: 'write'`, so AI Core pauses with an `approval_request` before either executes. Omit each until its driver is configured; the workflow then terminates at the analysis artifact.
- `quality.scorecard.get_entity_scorecard` is **not** allow-listed: the `-techradar` driver throws on it by design (*"TechRadar driver does not manage software component scorecards data records"*), and component scorecards belong to `tech-debt-ai-scout`.
- Catalog access goes through the injected `CatalogEntityResolver` rather than a tool.
- `memory: 'none'` — history lives in the durable observation series, not conversational memory, so a sweep's numbers are always recomputed from the current fleet.
- System prompt rules: adoption ratios, ring transitions, and deprecation findings are supplied **pre-computed** and must be quoted verbatim; never invent a package name, version, repository, ratio, or radar ring; cite `repo-N` for every counted repository and `radar-N` for the current ring; describe a dependency as *declared in a manifest*, never as "in production use"; state the scanned-vs-total repository count whenever a ratio is mentioned; when submission is not durable, say the proposal was queued rather than applied.

## Run Input Contract

The generic `AgentRunInput.input.query` carries a versioned JSON payload. `source` is discriminated so an `event` variant is additive when an events contract lands.

```ts
type RadarScanRequest = {
  version: 1;
  source: 'manual' | 'scheduler';   // 'event' reserved; see Prerequisites
  technologies?: string[];       // narrow measurement to specific packages
  quadrants?: string[];          // narrow to radar quadrants, e.g. ['tools']
  entityRefs?: string[];         // scan a subset of components
  ecosystems?: ('npm' | 'go' | 'python')[];   // default: configured parsers
  propose?: boolean;             // request the proposal path (still gated); default false
  fileTickets?: boolean;         // request deprecation tickets (still gated); default false
  cursor?: string;               // resume an interrupted sweep
};
```

Validation clamps `entityRefs` and the repo count, restricts `ecosystems` to available parsers, rejects unknown quadrants against the loaded radar, and forces both write paths through the approval gate regardless of caller.

## Radar Analysis Workflow

`RadarGraph` registers as `WorkflowRunner` id `tech-radar-analysis` and implements **both** `run()` and `resume()` — the latter for both sweep continuation and approval. It realizes the foundation doc's flow: **Repository Sweep → Trend Analysis → Draft Proposal → Human Review**. Measurement and transition decisions are deterministic; the model narrates.

### Deterministic graph nodes

1. **radar.load** — validate `RadarScanRequest`; read the radar source via `urlReader` (or `vcs.repository.read_file`) and parse it with `radarSource.ts` into `RadarEntry[]` (`radar-N` evidence). An unreadable or unparseable radar is a **terminal** `radar_unavailable` with no model call — without the current rings, a transition cannot be proposed, only invented.
2. **enumerate** — `RepoTargetResolver` lists candidate repositories with owners from the catalog; `sweepPlanner.ts` (pure) caps and orders them deterministically. Zero targets → `no_targets`.
3. **scan** — for each repo, locate and read configured manifests via `vcs.repository.search`/`read_file`, then `manifests.ts` (pure) parses declared direct dependencies per ecosystem. Each repo yields a `RepoScanOutcome`: `scanned`, `manifest_unavailable` (stub driver / no manifest), or `scan_failed`. **Counters and cursor are checkpointed after every repository**, so an interruption at repo 50 of 100 resumes with counts intact.
4. **measure** — `measure.ts` (pure, no LLM) computes per-technology `AdoptionMetric`: `repositoriesUsing / repositoriesScanned` — with `manifest_unavailable` repos excluded from **both** numerator and denominator — plus `ObservationSeries` velocity over the trailing window. This is the foundation doc's ">30% of scanned manifests" measurement, and the exclusion rule is what keeps it honest.
5. **propose** — `transitions.ts` (pure) maps each metric plus its current radar ring to a `RingTransitionProposal` using the configured threshold table (`assess → trial` at ≥30%, `trial → adopt` at ≥60% with positive velocity), and `deprecations.ts` (pure) matches `hold`/EOL radar entries against observed usage to produce per-owner `DeprecationFinding[]`. Duplicate-capability detection flags a newly-adopted technology whose quadrant already has an `adopt`-ring incumbent. One model call then writes proposal prose and the quarterly executive summary. Emits the `radar-analysis` artifact.
6. **gate** — when `propose`/`fileTickets` are requested, the corresponding write tool is registered, and the matching config flag is enabled, emit `approval_request` carrying the exact proposals and ticket set, checkpoint, and **suspend**. Analysis-only sweeps finish at the artifact.
7. **submit** *(resume path)* — `resume(runId, decision, context)`: on `approved`, call `quality.scorecard.submit_radar_proposal` per proposal and `project.ticket.create` per deprecation owner, recording each result (including the `proposal_not_durable` caveat), emit a `radar-submission-record` artifact plus audit entry, and finish `submitted` or `partially_submitted`; on `rejected`, record the decision and finish `analysis_only` with nothing written.

### State and output schema

```ts
type EvidenceRef = { id: string; source: 'radar' | 'repo' | 'manifest' | 'observation' | 'knowledge'; summary: string; reference?: string };

type RadarEntry = {              // parsed from the radar source; authoritative
  id: string;                    // 'vite'
  title: string;
  ring: 'assess' | 'trial' | 'adopt' | 'hold';
  quadrant: string;              // 'tools' | 'languages' | 'frameworks' ...
  evidence: string[];            // radar-N
};

type DeclaredDependency = {
  name: string;
  version?: string;
  ecosystem: 'npm' | 'go' | 'python';
  manifestPath: string;
};

type RepoScanOutcome = {
  repoUrl: string;
  entityRef?: string;
  owner?: string;
  status: 'scanned' | 'manifest_unavailable' | 'scan_failed';
  dependencies: DeclaredDependency[];
  reason?: string;
};

type AdoptionMetric = {
  technology: string;            // matches RadarEntry.id where known
  repositoriesUsing: number;
  repositoriesScanned: number;   // excludes manifest_unavailable
  ratio: number;                 // using / scanned
  currentRing?: RadarEntry['ring'];
  velocity?: {                   // from the observation series
    windowDays: number;
    previousRatio?: number;
    direction: 'rising' | 'flat' | 'falling' | 'insufficient_history';
  };
  usingRepos: string[];          // repo-N citations
};

type RingTransitionProposal = {
  technology: string;
  fromRing: RadarEntry['ring'];
  toRing: RadarEntry['ring'];
  quadrant: string;
  triggeredBy: string[];         // which threshold rules fired
  metric: AdoptionMetric;
  rationale: string;             // model copy; must cite repo-N / radar-N
};

type DeprecationFinding = {
  technology: string;            // hold/EOL radar entry still in use
  ring: 'hold';
  owner?: string;                // routing target
  affectedRepos: string[];       // repo-N
  suggestedAlternative?: string; // an adopt-ring entry in the same quadrant
};

type AdoptionSnapshot = {        // one per sweep; the longitudinal record
  observationSeriesId: string;   // stable key for the rolling series
  takenAt: string;
  repositoriesScanned: number;
  counts: Record<string, number>; // technology -> repositoriesUsing
};

// RadarState: { request, radar: RadarEntry[], targets: RepoScanOutcome[],
//   metrics: AdoptionMetric[], proposals: RingTransitionProposal[],
//   deprecations: DeprecationFinding[], cursor?, limitations: string[],
//   status: 'analysis_only'|'awaiting_approval'|'submitted'|'partially_submitted'
//         |'no_targets'|'radar_unavailable'|'truncated'|'partial' }

type RadarAnalysis = {
  radarSource: string;           // resolved URL, credentials stripped
  scannedAt: string;
  coverage: { scanned: number; unavailable: number; failed: number; total: number };
  metrics: AdoptionMetric[];
  proposals: RingTransitionProposal[];
  deprecations: DeprecationFinding[];
  duplicateCapabilities: { technology: string; incumbent: string; quadrant: string }[];
  executiveSummary: string;      // model prose, validated against the record
  status: RadarState['status'];
  cursor?: string;
  limitations: string[];         // e.g. 'proposal_not_durable', 'search unsupported'
  evidence: EvidenceRef[];
};

type RadarSubmissionRecord = {
  analysisRef: string;
  approvedBy: string;
  proposalsSubmitted: { technology: string; proposalId: string; durable: boolean }[];
  ticketsFiled: { technology: string; owner?: string; ticketId: string }[];
  skipped: { target: string; reason: string }[];
  failures: { target: string; reason: string }[];
  outcome: 'submitted' | 'partially_submitted';
};
```

Status mapping is fixed in code, not inferred: unreadable radar → `radar_unavailable`; zero targets → `no_targets`; any repo `manifest_unavailable`/`scan_failed` → `partial` with coverage named; sweep interrupted → `truncated` with a `cursor`; analysis with writes disabled or rejected → `analysis_only`; approved with all writes succeeding → `submitted`; approved with any failure → `partially_submitted`.

## Deterministic Adoption Measurement (New Structural Section)

A ring promotion changes org-wide architecture policy, so the number driving it must be arithmetic a reviewer can re-derive by hand.

- `manifests.ts`, `measure.ts`, and `transitions.ts` are pure: no AI Core, tool, or clock dependency. Every parser and threshold branch is unit-testable on fixture manifests, which is what makes the foundation doc's ">30% → promote" assertion directly checkable.
- **The denominator is the honest part.** `ratio = repositoriesUsing / repositoriesScanned`, and a repo that could not be read (`manifest_unavailable` from a stub search driver, or no manifest for the ecosystem) is excluded from **both** sides. Counting an unscanned repo as a non-adopter would understate every ratio and suppress legitimate promotions — the quietest possible wrong answer here.
- **Coverage travels with the number.** `RadarAnalysis.coverage` reports scanned/unavailable/failed/total, and the prompt requires the scanned count beside any ratio. "30% of 10 scanned repos" is a very different claim from "30% of 400", and a proposal that hides the sample size is not reviewable.
- Thresholds are a **config-declared table** keyed on `(fromRing, toRing)` with an optional velocity requirement, so an architect can see and tune exactly what triggers a promotion. Demotions (`adopt → hold`) are deliberately **not** automated: falling adoption is weak evidence for deprecation, which is a policy decision rather than a measurement.
- **Declared, not used.** A dependency in `package.json` may be dev-only, vendored, or dead. Metrics say "declared in a manifest" and the prompt forbids "in production use" phrasing. No transitive or lockfile resolution in v1.
- Matching manifest package names to `RadarEntry.id` uses a config alias map (`vite` ↔ `@vitejs/plugin-*`), with unmatched-but-popular packages reported as **radar gaps** — technologies widely used but absent from the radar, which is often the more valuable finding.

## Longitudinal Observation Series (New Structural Section)

Velocity is the foundation doc's key signal, and the core store cannot currently answer "what did this look like 90 days ago".

- **The gap is real**: `ArtifactSink` is write-only and `SqlAgentRuntimeStore` has no artifact query, so a sweep cannot read prior sweeps' artifacts. v1 therefore writes each `AdoptionSnapshot` as an artifact **for the record** and separately maintains a compact rolling series in a plugin-owned checkpoint keyed by a stable `observationSeriesId`.
- The series is deliberately **tiny and aggregate**: `{ takenAt, repositoriesScanned, counts: Record<technology, number> }`. No repository lists, no dependency files, no per-file data — bounded to `maxSeriesEntries` and pruned to `velocityWindowDays`, so it cannot grow without limit inside a checkpoint.
- `velocity.ts` is pure over that series and reports an explicit **`insufficient_history`** direction when fewer than `minSnapshots` exist. A first sweep must never present a fabricated trend — the honest answer is "no history yet", and threshold rules requiring positive velocity simply do not fire.
- Snapshots are only appended for sweeps whose coverage exceeds `minCoverageRatio`, so a partially-failed sweep cannot poison the trend line with an artificially low count.
- The series is keyed by scan **scope** (ecosystems + target set), so narrowing a sweep starts a new series rather than silently comparing incomparable populations.
- **Long-term fix**: adding `listArtifacts(filter)` to `RunStore`/`ArtifactSink` in core would let this read its own history properly and would serve every trend-oriented agent. Listed in Shared Work; the checkpoint approach is a deliberate bridge, not the destination.

## Approval-Gated Radar Submission (New Structural Section)

Two write paths share one gate, and one of them currently lies about success.

- The gate uses existing `ApprovalRequest`/`ApprovalDecision`, `CheckpointStore`, and `AuditLogSink` — no new machinery. The payload carries every proposed transition (technology, from-ring, to-ring, ratio, sample size) and every deprecation ticket, so the reviewer sees exactly what will be written.
- **`proposal_not_durable` is a first-class limitation.** When the active driver is `tech-radar`, `submitRadarProposal` stores into an in-memory `Map` and returns a synthetic ID. The plugin records `durable: false` on that submission, attaches the limitation to the analysis, and the UI must say *queued for review* rather than *submitted to the radar*. Reporting a vanished proposal as applied would quietly erode trust in the whole agent.
- `submit.ts` is ordered and partially-failable: proposals first, then deprecation tickets. There is no batch op for either, so each is a sequential call with per-target success/failure recorded — and no rollback attempted, since neither driver exposes a delete.
- **Idempotency by `(technology, fromRing, toRing, observationSeriesId)`** for proposals and `(technology, owner, ring)` for tickets. A repeated approved resume re-reads the prior `RadarSubmissionRecord` and skips completed targets, so double-clicking approve cannot double-file.
- Both writes use the **approver's** credentials so radar and board permissions apply, and every target's outcome is audited individually alongside the ratio that justified it — the audit trail an Architecture Review Board needs.
- Scheduled sweeps reach the gate but cannot satisfy it: the service principal holds no approval authority, so an unapproved proposal set expires as a pending artifact rather than mutating policy on a cron.

## Background Scheduler Tasks (Weekly Sweep)

- `scheduler/weeklySweep.ts` registers one `coreServices.scheduler` task: `id: 'tech-radar-manager-weekly-sweep'`, `frequency: { cron }` from config (default `0 22 * * 0` — Sunday night, matching the foundation doc), bounded `timeout`, non-zero `initialDelay`, `scope: 'global'`.
- The task POSTs runs to `/agents/tech-radar-ai-manager/runs` via `auth.getPluginRequestToken` + `discovery.getBaseUrl('ai-core')` with `source: 'scheduler'`, `propose: true`. It never executes the graph in-process.
- **Scheduled sweeps stop at the approval gate and never submit autonomously**, so a cron loop cannot drift the radar without an architect's decision.
- The sweep is also the **observation collector**: even an analysis-only run appends its `AdoptionSnapshot`, so trend history accrues whether or not anyone approves a proposal. This is why the sweep should be enabled well before proposals are.
- Guardrails: global mutex, per-sweep repo cap, sequential dispatch with delay, coverage floor before snapshotting, and kill switch `sweep.enabled` (default **false**).

## Vector Store Integration

- **No new vector infrastructure and no new indexing.** `knowledge.retrieve` reads the existing corpus (architecture-decision records, radar rationale docs, migration guides) owned by `plugin-ai-core-backend-module-retrieval-augmenter`; observation/checkpoint state lives in `plugin-ai-core-backend-module-runtime-store`.
- Retrieval is **rationale only** and structurally barred from `measure.ts`/`transitions.ts`, which receive counters, radar entries, and config — never retrieval output. Tests assert ratios and proposed transitions are byte-identical with retrieval on and off.
- **Never index manifests or dependency inventories.** They change constantly and describe internal architecture; embedding them would create a stale, sensitive shadow inventory outside catalog permissions.

## Configuration

```yaml
ai:
  agents:
    techRadarManager:
      model: tech-radar-manager     # installation-registered model ID, required
      radar:
        sourceUrl: https://github.com/acme/radar/blob/main/radar-data.json  # required
        format: json                # optional, default json ('json' | 'yaml')
      maxRepositories: 200          # optional, default 200 per sweep
      maxToolInvocations: 220       # optional, default 220 (one+ read per repo)
      sweepTimeoutSeconds: 1800     # optional, default 1800 wall-clock budget
      ecosystems:                   # optional; manifest parsers to run
        npm: ['package.json']
        go: ['go.mod']
        python: ['requirements.txt', 'pyproject.toml']
      aliases:                      # optional package -> radar entry id mapping
        '@vitejs/plugin-react': vite
      thresholds:                   # ring transition rules, evaluated in order
        - from: assess
          to: trial
          minRatio: 0.3             # the foundation doc's 30% case
        - from: trial
          to: adopt
          minRatio: 0.6
          requireRisingVelocity: true
      observations:
        velocityWindowDays: 90      # optional, default 90 (quarterly review)
        minSnapshots: 2             # optional, default 2 before reporting a trend
        maxSeriesEntries: 26        # optional, default 26 (~6 months weekly)
        minCoverageRatio: 0.5       # optional, default 0.5 before snapshotting
      propose:
        enabled: false              # optional, default false; gates radar proposals
      tickets:
        enabled: false              # optional, default false; gates deprecation tickets
        labels: ['tech-radar', 'deprecation']
      sweep:
        enabled: false              # optional, default false
        cron: '0 22 * * 0'          # optional, default Sunday 22:00
```

`config.ts` mirrors `readCatalogAiInsightsConfig`: throw when the section, `model`, or `radar.sourceUrl` is absent; document every default in `config.d.ts`. Validate at boot that every `thresholds` entry names known rings, that `minRatio` is within `0..1`, and that no rule proposes a demotion (`adopt → hold`) — v1 refuses to automate demotions, so such a rule is a configuration error rather than a silent no-op.

## Shared AI-Core Work To Build First

- **Nothing blocks a useful v1**: radar read, repo enumeration, manifest scan, measurement, proposal drafting, and both approval-gated writes all work with today's contracts.
- **Blocking for real radar integration — persist `TechRadarDriver` proposals.** The driver's `Map` must become durable storage (a table, or a PR against the radar source via the future `vcs.pull_request.create`), and `techRadar.url` must actually be used. Until then the plugin is honest but its submissions do not survive a restart. This lives in `plugin-ai-core-backend-module-quality-scorecards-techradar`, not here.
- **Recommended — `listArtifacts(filter)` on the runtime store.** Would let this plugin read its own history instead of maintaining a checkpoint-backed series, and would serve every trend-oriented agent. Additive to `RunStore`/`ArtifactSink`.
- **Optional — extend VCS search coverage.** Real `searchRepository` for Bitbucket/Gerrit converts `manifest_unavailable` repos into counted ones, directly improving ratio representativeness. Shared with `search-ai-context` and `tech-debt-ai-scout`.
- **Deferred — the events contract** for PR-time duplicate-capability alerts. Shared with `search-ai-context`; do not build a bespoke subscriber here.
- **No new measurement, threshold, or scheduling machinery** — `manifests.ts`, `measure.ts`, `transitions.ts`, `deprecations.ts`, `velocity.ts`, and `sweepPlanner.ts` are plugin-local pure modules; approval types, `resume()`, checkpoints, audit, and the scheduler are consumed as-is.

## Frontend Plan

Mirror the `catalog-ai-insights` frontend layout and wiring exactly: `alpha.ts` composing extensions into a `createFrontendPlugin` `FrontendFeature`, `extensions/api.ts` using `ApiBlueprint.make({ params: defineParams => defineParams(createApiFactory({...})) })`, `extensions/components.ts` using `PageBlueprint.make({ name, params: { path, title, routeRef, loader } })`, self-contained wire types in `@types/`, and an SSE client over `discoveryApi.getBaseUrl('ai-core')` with `eventsource-parser` and `Last-Event-ID` replay. Every directory carries a barrel `index.ts`. The package directory exists but is **empty** — scaffold it from scratch.

```text
plugins/frontend/plugin-ai-agent-frontend-tech-radar-ai-manager/
  src/
    index.ts                      # barrel: public components/api/types
    alpha.ts                      # createFrontendPlugin: pluginId + extensions
    plugin.ts                     # legacy-system plugin + routable extension
    routes.ts                     # ROOT_PATH + rootRouteRef
    @types/
      index.ts                    # RadarScanRequest/RadarAnalysis/SubmissionRecord wire types
    api/
      index.ts                    # barrel
      apiRef.ts                   # techRadarManagerApiRef
      client.ts                   # TechRadarManagerClient: analyze(), streamRunEvents(), submitApproval(), listAnalyses()
    hooks/
      index.ts                    # barrel
      useRadarAnalysis.ts         # pure reducer + hook (analyze/approve/reject/reset)
      useAdoptionTrends.ts        # observation series for the trend charts
    components/
      index.ts                    # barrel
      RadarManagerPage.tsx        # standalone: proposal dashboard + on-demand analysis
      RunAnalysisDialog.tsx       # technologies/quadrants/ecosystems/propose inputs
      AnalysisRunView.tsx         # live per-node + per-repo progress from SSE
      ProposalTable.tsx           # technology, from-ring -> to-ring, ratio, sample size
      AdoptionEvidencePanel.tsx   # the counted repositories behind a ratio
      CoverageBanner.tsx          # scanned / unavailable / failed out of total
      VelocityChart.tsx           # observation series trend, or insufficient-history state
      DeprecationFindingList.tsx  # hold-ring usage by owner + suggested alternative
      RadarGapPanel.tsx           # widely-used technologies absent from the radar
      QuarterlySummaryPanel.tsx   # the executive summary for the review board
      ProposalApprovalBar.tsx     # approve/reject the exact proposal + ticket set
      SubmissionOutcomePanel.tsx  # submitted / skipped / failed, with durability flag
    extensions/
      api.ts                      # ApiBlueprint.make(...)
      components.ts               # PageBlueprint.make(...)
    __tests__/
```

Frontend deltas vs `catalog-ai-insights`:

- `backstage.pluginId: 'tech-radar-ai-manager'`; package `@ai-crew-suite/plugin-agent-tech-radar-manager`.
- Primary surface is a **standalone proposal dashboard** via `PageBlueprint`. No `EntityCardBlueprint` — the subject is an organization-wide technology, not one catalog entity.
- **`CoverageBanner` is a correctness surface.** Every ratio must be shown against its sample size and unscanned count; "30% adoption" from 8 of 200 repositories is not a promotion case, and the UI must make that visible rather than letting a percentage stand alone.
- **`SubmissionOutcomePanel` must surface the durability flag.** When `durable: false`, it reads *"queued for review — not persisted to the radar source"*, never a bare success. This is the UI half of the stub-driver finding, and getting it wrong would misinform the review board.
- `AdoptionEvidencePanel` lists the exact repositories counted, deep-linked, so an architect can audit a ratio by clicking rather than trusting it.
- `VelocityChart` renders `insufficient_history` explicitly as an empty-with-explanation state — never a flat line implying measured stability.
- `RadarGapPanel` surfaces widely-used technologies missing from the radar, often the most actionable output of a sweep.
- `radar_unavailable`, `no_targets`, `partial`, and `truncated` (with a continue affordance) render as first-class explained outcomes, not errors.

## Test Strategy

Reuse the `catalog-ai-insights` test-layer table (unit/contract/backend integration/runtime integration/LLM evaluation/full-stack E2E) and its network policies. Deltas only:

- **Unit (the highest-value layer here)**: `radarSource.ts` JSON and YAML parsing, plus a malformed radar producing `radar_unavailable` rather than an empty entry list. `manifests.ts` per-ecosystem parsing (`package.json` deps + devDeps, `go.mod` require blocks, `requirements.txt` pins) and alias mapping. `measure.ts` ratio arithmetic — specifically that a `manifest_unavailable` repo is excluded from **both** numerator and denominator. `transitions.ts` threshold evaluation including the `requireRisingVelocity` guard and refusal to emit demotions. `deprecations.ts` hold-ring matching with owner routing. `velocity.ts` `insufficient_history` on a single snapshot.
- **Workflow (runtime) tests**: drive `RadarGraph.run()` with a stubbed `WorkflowContext` (`invokeTool` mock router keyed by `toolId` + args), a fake `CatalogEntityResolver`, and a fixture radar file — the codebase-accurate replacement for the foundation doc's `github.service` sketch. **Headline scenario (the foundation doc's own test)**: radar has `vite: assess` and `webpack: adopt`; three repos scanned where `repo-alpha` and `repo-beta` declare `vite` and `repo-gamma` declares `webpack`. Assert `vite` measures `2/3 ≈ 0.67`, crosses the 0.3 threshold, produces an `assess → trial` proposal citing both repos, the run **suspends** at `approval_request`, and neither write tool was called.
- **Denominator-integrity test** (the plugin's sharpest correctness risk): the same fixture but with `repo-gamma` on a stub search driver. Assert it is `manifest_unavailable`, the ratio becomes `2/2 = 1.0` over a **scanned count of 2**, coverage reports one unavailable, and a limitation is attached — never `2/3` with a silent miscount.
- **Velocity tests**: seed an `ObservationSeries` with a prior snapshot at 10% and assert `direction: 'rising'` and that a `requireRisingVelocity` rule fires; with no prior snapshot assert `insufficient_history` and that the same rule does **not** fire.
- **Snapshot-hygiene tests**: a sweep below `minCoverageRatio` appends **no** snapshot (so a partial sweep cannot poison the trend); a narrowed scope starts a new `observationSeriesId`; the series prunes to `maxSeriesEntries`.
- **Resumability tests** (the foundation doc's §2): interrupt the scan at repo 50 of 100 and assert the cursor **and accumulated counters** are checkpointed, status is `truncated`, and `resume()` continues at repo 51 without re-reading the radar or re-scanning completed repos.
- **Durability-honesty test**: with the `tech-radar` driver active, `resume('approved')` records `durable: false`, attaches `proposal_not_durable`, and the artifact does **not** claim the radar was updated.
- **Approval-gate hardening**: no write when the model hallucinates a tool call or attempts to skip the gate; `resume('approved')` submits each proposal and files each ticket exactly once; a mid-loop failure yields `partially_submitted` with exact `failures`; a repeated approved resume submits nothing new (idempotent by `(technology, fromRing, toRing, seriesId)`).
- **Anti-fabrication tests**: a model rationale naming a repository, package, ratio, or ring absent from the computed record is stripped; assert the executive summary contains no technology outside `metrics`.
- **`knowledge.retrieve` isolation**: pre-baked ADR chunks; assert ratios, transitions, and deprecations are byte-identical with retrieval on and off.
- **Scheduler tests**: `mockServices.scheduler` fast-forwards the Sunday tick; assert bounded authenticated dispatch, `sweep.enabled: false` respected, mutex skipping, **no autonomous submission**, and that an analysis-only sweep still appends its snapshot.
- **Backend integration**: `startTestBackend` with this module + AI Core + `mockServices.rootConfig` + `mockServices.database` + `mockServices.urlReader` (the foundation doc's `extraReaders` radar fixture), asserting boot registration, per-node SSE ordering, per-repo checkpointing, resume flow, and analysis/submission artifact persistence.
- **E2E**: extend the shared fixture profile with a fixture radar file, fixture repositories with seeded manifests, and fixture radar/ticket drivers. Playwright: open the dashboard → run an analysis → inspect coverage, adoption evidence, and the proposal → approve → assert the outcome panel shows the durability caveat; plus a reject path and an `insufficient_history` first-sweep path. Add `yarn test:e2e:tech-radar-ai-manager`.

## Security and Operational Guardrails

`catalog-ai-insights` guardrails apply unchanged (identity propagation, redaction before model/SSE/artifacts, tool/token/wall-clock caps, correlation IDs). Radar-specific additions:

- **No radar change or ticket without a persisted human approval**, and both write paths default to disabled. The decision, `approvedBy`, every proposal's ratio and sample size, and every returned ID are audit-logged; rejections are audited too. Scheduled sweeps reach the gate but cannot satisfy it.
- **Never overstate a submission.** When the driver is in-memory, `durable: false` and `proposal_not_durable` must appear in the artifact and the UI. Silent data loss presented as success is the failure mode most likely to discredit the plugin with an Architecture Review Board.
- **Never miscount the denominator.** Unscannable repositories are excluded and reported, never treated as non-adopters; every ratio ships with its sample size and coverage.
- **Radar rings come from the radar.** The plugin never infers a current ring, never edits the source file, and refuses to propose demotions automatically — deprecation is a policy judgment, not a measurement.
- Manifests describe internal architecture: cap `maxRepositories` and per-file bytes, retain **aggregate counts** rather than raw manifest bodies in artifacts and observations, and scrub secret-shaped strings from any snippet before it reaches the model, SSE, artifacts, or logs.
- Manifest content is **untrusted input**: delimit it in the prompt with an instruction not to follow embedded directives, since a dependency name or description field is attacker-influenceable in a forked repository.
- Authorization is per-caller: radar, repository, and ticket reads propagate the requester's credentials; writes use the approver's, so radar and board permissions apply.
- Third-party APIs are metered: per-sweep repo caps plus a wall-clock budget mean a fleet sweep degrades to `truncated` rather than exhausting a code-search or Jira quota.

## Ordered Implementation Milestones

### Milestone 0: Pure engines and contracts

- [ ] Confirm `quality.scorecard.submit_radar_proposal` (and its stub driver), `project.ticket.create`, `vcs.repository.search`/`read_file`, and `CatalogEntityResolver` against the installed code; enumerate search-capable providers.
- [ ] Define `RadarEntry`, `DeclaredDependency`, `RepoScanOutcome`, `AdoptionMetric`, `RingTransitionProposal`, `DeprecationFinding`, `AdoptionSnapshot`, `RadarAnalysis`, `RadarSubmissionRecord`, and the config schema.
- [ ] Implement + unit-test `radarSource.ts`, `manifests.ts`, `measure.ts`, `transitions.ts`, `deprecations.ts`, `velocity.ts`, and `sweepPlanner.ts`.

Exit criteria: ratio arithmetic (including denominator exclusion), threshold evaluation, and `insufficient_history` handling are provably deterministic on fixtures.

### Milestone 1: Analysis backend (read-only)

- [ ] Scaffold the package with a barrel `index.ts` in every directory, register the runner/agent/manual trigger, config parsing; register in root `tsconfig.json` + `.eslintrc.cjs`.
- [ ] Implement radar.load → enumerate → scan → measure → propose → `radar-analysis`, with `RepoTargetResolver` and `RadarToolRunner` (including `manifest_unavailable` classification).
- [ ] Wire into `packages/backend` and add the `ai.agents.techRadarManager` config block.
- [ ] Add unit, workflow-scenario, denominator-integrity, and backend integration tests.

Exit criteria: the foundation doc's vite-vs-webpack fixture produces a correct `assess → trial` proposal with cited repositories, no real LLM, and no writes.

### Milestone 2: Observation series and resumable sweeps

- [ ] Implement `ObservationSeries` (checkpoint-backed rolling snapshots, scope keying, pruning, coverage floor), velocity computation, and per-repo cursor/counter checkpointing with per-repo error isolation.
- [ ] Velocity, snapshot-hygiene, and resumability tests.

Exit criteria: velocity is computed from real history with an honest `insufficient_history` first sweep; an interrupted sweep resumes without losing counters.

### Milestone 3: Approval-gated submission

- [ ] Implement the gate + `RadarGraph.resume()`: checkpointed proposal/ticket set, `approval_request`, sequential submission via `quality.scorecard.submit_radar_proposal` and `project.ticket.create`, durability flagging, `radar-submission-record` artifact, audit, and idempotency.
- [ ] Gate-hardening and durability-honesty tests.

Exit criteria: writes occur only after approval, exactly once per target, and a non-durable submission is provably reported as such.

### Milestone 4: Scheduled sweep, frontend, and E2E

- [ ] Implement `weeklySweep` with mutex, caps, coverage floor, and kill switch, plus fast-forwarded scheduler tests asserting no autonomous submission and snapshot accrual on analysis-only runs.
- [ ] Scaffold the empty frontend package (`ApiBlueprint` + `PageBlueprint`, dashboard, analysis dialog, run view, proposal table, adoption evidence, coverage banner, velocity chart, deprecation list, radar gaps, quarterly summary, approval bar, outcome panel) with barrel indexes, and register it in `packages/app`.
- [ ] Component tests (loading, streaming, radar_unavailable/no_targets/partial/truncated, insufficient history, awaiting approval, submitted, partially_submitted, replay) plus accessibility checks — including assertions that coverage accompanies every ratio and that `durable: false` is visibly distinct from success.
- [ ] Extend the E2E fixture profile and add Playwright analysis, approve, reject, and first-sweep scenarios with screenshot review.

Exit criteria: `yarn test:e2e:tech-radar-ai-manager` demonstrates analysis → proposal → approve → outcome with the durability caveat, plus reject and no-history paths, without external infrastructure.

### Milestone 5: Production readiness

- [ ] Document model registration, radar source setup, threshold tuning, alias curation, ecosystem parsers, sweep/write enablement, approver permissions, and — prominently — the **in-memory radar driver caveat** and the declared-vs-used measurement boundary.
- [ ] Dashboards/alerts for proposals per sweep, **coverage ratio** (the key trust metric), `manifest_unavailable` count, approval/rejection ratio, non-durable submission count, radar-gap count, and token cost per sweep.
- [ ] Opt-in real-model evaluation suite (grounding: every rationale cites counted repositories; no invented packages, ratios, or rings; no "in production use" phrasing) within budget.
- [ ] Follow-ups: persist `TechRadarDriver` proposals, add `listArtifacts` to core, extend Bitbucket/Gerrit search.

Exit criteria: staged rollout with sweeps enabled but writes disabled, verified measurement grounding, and the durability caveat documented for the review board.

## Frontend Complete

### Standalone analysis UI

- Route: `/tech-radar-ai-manager`

- Agent: `tech-radar-ai-manager`

- Artifact: `radar-analysis`

- Supports authenticated AI Core SSE:

  - Start a scoped repository analysis.
  - Replay persisted analysis with `?run=<id>`.

### UI behavior

- Requires an HTTP(S) repository URL.

- Displays:

  - Analysis progress.
  - Coverage totals.
  - Declared direct-dependency adoption metrics.
  - Current authoritative radar ring.
  - Deterministic transition recommendations.
  - Triggered deterministic rules.
  - Backend limitations.
  - Evidence citations.

- Clearly labels recommendations as analysis-only.

- Intentionally provides __no__ submit, approval, ticket, or radar mutation controls.

### Honesty boundaries reflected in the UI

The page does not imply that these later-plan capabilities are available:

- Fleet-wide scans.
- Durable longitudinal velocity analysis.
- Knowledge-enrichment rationale.
- Deprecation ticket filing.
- Approval-gated radar proposal submission.
- Persisted/durable radar changes.

## Registration

Wired into:

- `/home/kevin/Repos/backstage/ai-crew-suite/tsconfig.json`
- `/home/kevin/Repos/backstage/ai-crew-suite/.eslintrc.cjs`
- `/home/kevin/Repos/backstage/ai-crew-suite/packages/app/package.json`
- `/home/kevin/Repos/backstage/ai-crew-suite/packages/app/src/App.tsx`
- `/home/kevin/Repos/backstage/ai-crew-suite/packages/app/src/App.test.tsx`
- `/home/kevin/Repos/backstage/ai-crew-suite/yarn.lock`

## Tests

Added:

- Radar artifact reducer success and malformed-JSON handling.
- Analysis panel rendering for metrics, transition recommendation, limitations, and evidence links.
- Updated the app feature-list test for `tech-radar-ai-manager`.

## Backend Complete

## Delivered

### AI Core module

- Agent ID: `tech-radar-ai-manager`
- Workflow ID: `tech-radar-analysis`
- Artifact: `radar-analysis`
- Current read-only tool allow-list:
  - `vcs.repository.read_file`

### Deterministic scoped analysis

- Validates one versioned, HTTP(S)-scoped repository request.
- Reads the configured authoritative JSON radar source through `coreServices.urlReader`.
- Parses current radar entries and uses their rings/quadrants as the only authoritative radar state.
- Reads the repository's `package.json` through `vcs.repository.read_file`.
- Extracts direct declared dependencies only.
- Calculates direct-dependency adoption metrics.
- Deterministically proposes only `assess → trial` transitions when the configured threshold is met.
- Emits a replayable cited `radar-analysis` artifact.
- Fails honestly as `radar_unavailable` when the radar source cannot be loaded or parsed.

### Explicit limitations retained in every analysis

The current workflow correctly identifies these planned capabilities as unavailable rather than implying they work:

- Catalog fleet enumeration and multi-repository coverage.
- Durable longitudinal/velocity history.
- Knowledge retrieval enrichment.
- Approval-gated radar proposal submission.
- Deprecation ticket filing.
- Durable Tech Radar submission—the installed driver is in-memory and non-durable.

No radar writes are exposed by this implementation.

## Tests

Added focused coverage for:

- JSON radar parsing.
- Direct dependency measurement.
- Deterministic assess-to-trial proposal creation.
- No promotion for adopted or unused dependencies.
- Radar graph artifact creation from radar and package manifest evidence.
- Module registration and strict read-only tool allow-list.

## Wiring

Registered the module in:

- `/home/kevin/Repos/backstage/ai-crew-suite/tsconfig.json`
- `/home/kevin/Repos/backstage/ai-crew-suite/.eslintrc.cjs`
- `/home/kevin/Repos/backstage/ai-crew-suite/packages/backend/package.json`
- `/home/kevin/Repos/backstage/ai-crew-suite/packages/backend/src/index.ts`
- `/home/kevin/Repos/backstage/ai-crew-suite/app-config.yaml`
- `/home/kevin/Repos/backstage/ai-crew-suite/yarn.lock`

Configured:

```yaml
ai:
  agents:
    techRadarManager:
      model: tech-radar-manager
      radar:
        sourceUrl: https://example.invalid/radar-data.json
```

## Definition of Done

- Package, agent, runner (`run` + `resume`), triggers (manual + sweep), config schema, and the allow-list implemented and registered (root + backend/app wiring included), with a barrel `index.ts` in every directory.
- Runs execute through the real AI Core controller/runtime with persisted replayable events, per-repository checkpoints preserving counters, and `radar-analysis` / `radar-submission-record` artifacts.
- Adoption ratios, ring transitions, and deprecation findings are pure, config-driven, deterministic code — never model output — and every ratio ships with its sample size and coverage.
- Unscannable repositories are excluded from both numerator and denominator and reported as `manifest_unavailable`; no repository is ever silently counted as a non-adopter.
- Velocity comes from a real observation series with an explicit `insufficient_history` state; partial sweeps never append a snapshot.
- No radar proposal or ticket is written without a persisted approval; submissions are idempotent, use the approver's credentials, and a non-durable submission is reported as `durable: false` with a `proposal_not_durable` limitation rather than as success.
- The plugin never edits the radar source file, never infers a current ring, and never automates a demotion.
- Frontend renders proposals, coverage, adoption evidence, velocity, and approval over live SSE and replay via `ApiBlueprint`/`PageBlueprint`; Playwright verifies analysis, approve, reject, and first-sweep paths on fixtures.
- No output surface (SSE, artifacts, logs, audit, tests, tickets) contains raw manifest bodies, secrets, uncited ratios, invented packages or rings, or a submission presented as durable when it is not.
