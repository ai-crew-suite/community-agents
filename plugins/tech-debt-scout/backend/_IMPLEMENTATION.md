# Tech Debt AI Scout Implementation Plan

## Overview

This plugin systematically crawls your code repositories to automatically map, prioritize, and surface code rot, deprecated library usages, and complex technical debt hotspots.

- **The Task:** Surfacing tech debt across the organization's repositories.
- **The Logic:** A crew periodically scans repositories for deprecated libraries or "TODO" comments, creating Jira tickets or Backstage Scorecard updates.

## Goal

Implement `@ai-crew-suite/plugin-agent-tech-debt-scout-backend` as an AI Core backend module that turns scattered code rot into a prioritized, owner-routed backlog. A scheduled sweep walks catalog-registered repositories; a **Scanner** stage reads bounded source and dependency manifests to extract raw debt signals; a **Triager** stage deterministically scores them so a security `FIXME` or a CVE-exposed dependency escalates while a generic housekeeping `TODO` is suppressed; and a **Reporter** stage emits a cited `DebtReport` and — only after approval — opens one tracking ticket per escalated finding. A persistent fingerprint ledger guarantees a weekly cron never files the same ticket twice. A paired frontend plugin renders the debt dashboard, severity rationale, and suppressed findings.

Reuse the architecture proven by `plugin-ai-agent-backend-catalog-ai-insights` (its `_IMPLEMENTATION.md` is the source of truth for repository conventions, workflow-runner mechanics, event contracts, monorepo wiring, and test-layer definitions). This plan documents only what differs: **deterministic signal triage**, **fingerprint-based idempotency across cron sweeps**, **bounded fleet scanning**, and an **approval-gated ticket write**.

## Delivery Boundary

### In scope

- A scheduled fleet sweep plus an on-demand single-repository scan, via `/agents/tech-debt-ai-scout/runs`.
- Deterministic `plan → scan → triage → dedupe → report → gate` pipeline realizing the foundation doc's Scanner/Triager/Reporter roles as stages over one shared state channel. Signal extraction, severity scoring, suppression, and dedupe are pure code; the model only writes finding summaries and ticket bodies.
- Bounded reads: `vcs.repository.search` for marker discovery, `vcs.repository.read_file` for manifests and snippet context, `quality.scorecard.get_entity_scorecard` for existing health signals, and `knowledge.retrieve` for deprecation/CVE context.
- A `DebtReport` artifact where every finding cites a file path, line, and snippet hash, plus an explicit suppressed-findings list.
- Approval-gated ticket creation through `project.ticket.create`, emitting a `DebtTicketRecord` with per-finding results.
- A fingerprint ledger keyed on `path + normalized snippet` so consecutive sweeps update metrics without duplicate tickets.

### Explicitly out of scope for v1

- **Autonomous ticket creation.** No ticket is opened without a persisted human approval; `tickets.enabled` defaults to `false`, in which case the run terminates at the report.
- **Scorecard mutation.** No scorecard write tool exists (see Prerequisites) — the plugin *reads* scorecards for context and never publishes a debt score.
- Fixing debt: no PRs, no code edits, no dependency bumps. The scout finds and routes; humans remediate.
- Authoritative CVE assessment. Retrieval supplies *context* about known deprecations; the plugin does not claim a package is exploitable and never invents a CVE identifier.
- Full static analysis or complexity metrics (cyclomatic complexity, coverage). v1 covers textual markers, dependency-manifest staleness, and secret-shaped literals — and says so.
- Cross-repository debt correlation or org-wide trend modelling beyond per-sweep counts.

## Required Prerequisites

Contracts verified against the current codebase. As with the catalog plan: no fictional service refs — the foundation doc's `github.service` (`getFileContent`) and `jira.service` (`createDebtTicket`) `createServiceRef` sketches must **not** be implemented as written.

**Correction to the earlier draft — ticket writes are not blocked.** Luna's gate says "project ticket create/comment … write tools are absent". They are **present**: `project.ticket.create` and `project.ticket.comment` are both registered with `effect: 'write'`, and `CreateTicketInput` carries `{ title, description?, team?, labels?, priority?, parentId? }` — enough to file a titled, prioritized, labelled debt ticket against a team board today. So the Reporter's primary action is buildable in v1 behind the approval gate, not deferred.

**Luna's scorecard gate is confirmed, and is the one genuine write gap.** `QualityScorecardsDriver` exposes exactly two ops: `getEntityScorecard(entityRef)` (read — whose doc comment says *"Leveraged primarily by tech-debt-ai-scout"*) and `submitRadarProposal(input)` (write, but a **tech-radar** proposal belonging to `tech-radar-ai-manager`, not a debt score). There is **no** scorecard-write/fact-publish op, so the foundation doc's "update a component's Tech Debt health score" is genuinely out of reach.

| Capability | Required contract | Current state | Required action |
| --- | --- | --- | --- |
| Repo targets + owners | `CatalogEntityResolver` (`findByAnnotation`, `getEntitySummary`, `getIntegrationReferences`) | **Exists** — landed in `plugin-ai-core-node/src/catalog/`; `getIntegrationReferences().repositories` normalizes `github.com/*`, `gitlab.com/*`, and `source-location` annotations, and `owner` rides on every summary | Replaces the foundation doc's raw `'://github.com'` annotation parsing. Build the sweep target list and route findings to `owner`. |
| Marker discovery | `vcs.repository.search` | **Exists**, `effect: read`. **Driver quality is uneven** — GitHub/GitLab/Azure implement real search; **Bitbucket, Gerrit, and generic Git log a warning and return `[]`** | Primary Scanner input. On an incapable provider the scan must report `search_unsupported` per repo, never "no debt found" — a clean report from a stub driver would be actively misleading. |
| Manifest + snippet reads | `vcs.repository.read_file` | Exists, `effect: read` | Read `package.json`/`go.mod`/`requirements.txt` for dependency staleness, and bounded context around each marker hit. Replaces the invented `getFileContent`. |
| Source-tree scan (fallback) | `coreServices.urlReader` | Exists, used across the VCS modules | The foundation doc's Scanner service. Useful where `search` is unsupported but a manifest path is known. |
| Existing health signals | `quality.scorecard.get_entity_scorecard` | **Exists**, `effect: read`; returns `EntityScorecardSummary` with `overallStatus`, `score`, and `results: ScorecardCheckResult[]` | Read-only enrichment: an already-failing check corroborates a finding and feeds severity. Absent driver degrades with a limitation. |
| Deprecation / CVE context | `knowledge.retrieve` + `DefaultRetrievalPipeline` | Exists | Context only — supplies known-deprecation and advisory prose for the summary. **Never** sets severity and never mints a CVE ID. |
| **Ticket creation (the write)** | `project.ticket.create` → `createTicket(CreateTicketInput)` returning `TicketSummary` | **Exists**, `effect: 'write'` | Replaces the invented `createDebtTicket`. AI Core pauses with an `approval_request` before it runs. One ticket per escalated finding, sequential and partially-failable (no batch op exists). |
| Existing-ticket dedupe | `project.ticket.search` | Exists, `effect: read` | Second dedupe layer: skip a finding whose fingerprint already appears in an open ticket, even if the local ledger was cleared. |
| **Scorecard debt score (blocked)** | A scorecard fact/score write op | **Not present** — the driver has only `getEntityScorecard` (read) and `submitRadarProposal` (a tech-radar concern) | Out of scope for v1. Do **not** repurpose `submitRadarProposal` to publish a debt score; that would corrupt the radar owned by `tech-radar-ai-manager`. Adding a `publishScorecardFact` op is the future path. |
| Fingerprint ledger | AI Core runtime stores (runs/checkpoints/artifacts) | Exist | Track per-fingerprint ticket state; do **not** hand-roll the foundation doc's bespoke dedupe table. |
| Approval gate | `ApprovalRequest` / `ApprovalDecision`, `WorkflowRunner.resume()`, `CheckpointStore`, `AuditLogSink` | **Exist** | Implement `ScoutGraph.resume()`; checkpoint the frozen ticket plan; audit decision, actor, and fingerprints filed. |
| Scheduled sweeps | `coreServices.scheduler` + `discovery` + `auth` | Available | In-module weekly cadence (foundation doc: Sunday midnight), opt-in and globally mutexed. |

## Package Shape

Backend module from the same template as `catalog-ai-insights`, with a `stages/` directory mirroring the foundation doc's three roles. Every directory carries a barrel `index.ts` re-exporting its public surface, matching the reference plugin's export styling.

```text
plugins/backend/plugin-ai-agent-backend-tech-debt-ai-scout/
  package.json          # role: backend-plugin-module, pluginId: ai-core
  tsconfig.json
  config.d.ts
  README.md
  src/
    index.ts            # barrel: module default + public types
    module.ts           # registers runner, agent, triggers, scheduler sweep
    agent.ts            # TECH_DEBT_SCOUT_AGENT_ID, tool allow-list, system prompt
    config.ts           # readTechDebtScoutConfig (ai.agents.techDebtScout)
    workflow/
      index.ts          # barrel
      ScoutGraph.ts             # WorkflowRunner id 'tech-debt-scout' (run + resume)
      state.ts                  # ScoutState (targets, signals, findings, cursor)
      fingerprint.ts            # pure: path + normalized snippet -> stable hash
      report.ts                 # DebtReport schema, validation, degradation
      file.ts                   # approval-gated project.ticket.create executor
    stages/
      index.ts          # barrel
      scanner.ts                # repo reads -> DebtSignal[] (markers + manifests)
      triager.ts                # pure: DebtSignal[] -> scored/suppressed DebtFinding[]
      reporter.ts               # pure: findings -> owner-routed ticket plan
    rules/
      index.ts          # barrel
      markers.ts                # pure: TODO/FIXME/HACK/XXX classification patterns
      dependencies.ts           # pure: manifest parse -> stale/deprecated dep signals
      secrets.ts                # pure: secret-shaped literal detection + redaction
    scheduler/
      index.ts          # barrel
      weeklySweep.ts            # coreServices.scheduler registration (Sun 00:00)
      sweepPlanner.ts           # pure: catalog targets + caps -> bounded scan plan
    services/
      index.ts          # barrel
      RepoTargetResolver.ts     # CatalogEntityResolver adapter: repos + owners
      DebtLedger.ts             # fingerprint -> ticket state via runtime stores
      ScoutToolRunner.ts        # capped invokeTool facade, per-repo error classing
      ScoutArtifactWriter.ts
    @types/
      index.ts          # barrel: shared signal/finding/report contracts
    __tests__/
    workflow/__tests__/
    stages/__tests__/
    rules/__tests__/
    scheduler/__tests__/
    services/__tests__/
```

- `createBackendModule` with `pluginId: 'ai-core'`, `moduleId: 'agent-tech-debt-ai-scout'`.
- `module.ts` deps: `coreServices.rootConfig`, `coreServices.logger`, `coreServices.scheduler`, `coreServices.urlReader`, `coreServices.discovery`, `coreServices.auth`, `catalogServiceRef`, plus `agentExtensionPoint`, `triggerExtensionPoint`, `workflowRunnerExtensionPoint`. **No new core service keys are introduced.**
- Package naming, scripts, Apache header, root `tsconfig.json` references, and `.eslintrc.cjs` role overrides follow `catalog-ai-insights` and `plugin-registration.md` verbatim (not repeated here).

## Monorepo And App Wiring

Same delegated-but-verified steps as `catalog-ai-insights` (see that plan's "Monorepo And App Wiring"). Deltas:

- **Backend load**: add `"@ai-crew-suite/plugin-agent-tech-debt-scout-backend": "workspace:^"` to `packages/backend/package.json` and the matching `backend.add(loadBackendFeature(import(...)))` line in `packages/backend/src/index.ts`.
- **Driver gates**: ticket filing needs `plugin-ai-core-backend-module-project-management` plus its Jira driver; scorecard enrichment needs `plugin-ai-core-backend-module-quality-scorecards` plus a provider (`-soundcheck` / `-scorecards`). Both absences degrade the report with a named limitation rather than failing the run.
- **VCS driver choice materially changes scan quality.** GitHub/GitLab/Azure support real code search; Bitbucket/Gerrit/generic Git return `[]` after a warning, so marker discovery on those estates yields `search_unsupported` per repo. Document this in the package README so a quiet report is not mistaken for a clean codebase.
- **App config**: the module throws at boot without `ai.agents.techDebtScout.model`; add the config block (see Configuration). Sweeps need `sweep.enabled: true`; filing needs `tickets.enabled: true`.
- **Frontend registration**: `plugins/frontend/plugin-ai-agent-frontend-tech-debt-ai-scout/` exists but is **empty** — scaffold it from scratch. Add the workspace dependency to `packages/app/package.json`, import its `/alpha` default export in `packages/app/src/App.tsx`, and extend plugin-ID expectations in `packages/app/src/App.test.tsx`.
- **Yarn PnP refresh**: `yarn install` after any `package.json` edit, then `yarn typecheck --force` / `yarn lint --force`.
## Agent Definition

```ts
{
  id: 'tech-debt-ai-scout',
  modelRef: config.modelRef,          // installation-registered ID, e.g. 'tech-debt-scout'
  workflowRef: 'tech-debt-scout',
  memory: 'none',                     // each sweep is a fresh repository snapshot
  systemPrompt: TECH_DEBT_SCOUT_SYSTEM_PROMPT,
  toolIds: [
    'vcs.repository.search',
    'vcs.repository.read_file',
    'quality.scorecard.get_entity_scorecard',
    'project.ticket.search',
    'knowledge.retrieve',
    'project.ticket.create',          // effect: 'write' — only invoked post-approval
  ],
  triggers: [
    { id: 'debt-scan-on-demand', source: 'manual', agentId: 'tech-debt-ai-scout' },
    { id: 'debt-weekly-sweep', source: 'scheduler', agentId: 'tech-debt-ai-scout' },
  ],
}
```

- Read tools run freely. `project.ticket.create` is `effect: 'write'`, so AI Core pauses with an `approval_request` before it executes — the plugin must not bypass this. Omit it until a project-management driver is configured; the workflow then terminates at the report.
- `quality.scorecard.submit_radar_proposal` is **deliberately not allow-listed**: it writes a tech-radar proposal owned by `tech-radar-ai-manager`, not a debt score. Including it would let this agent corrupt another plugin's domain.
- Catalog access goes through the injected `CatalogEntityResolver` rather than a tool, matching how `catalog-ai-insights` consumes it.
- System prompt rules: severities, suppression decisions, and the ticket plan are supplied **pre-computed** and must be quoted verbatim; never invent a file path, line number, package version, or CVE identifier; cite `sig-N` for every signal and `sc-N`/`kb-N` for corroborating evidence; describe a marker as a *code comment*, not a proven defect; **never reproduce a detected secret value** in a summary or ticket body — reference its location only; when a repository could not be scanned, say so rather than implying it is clean.

## Run Input Contract

The generic `AgentRunInput.input.query` carries a versioned JSON payload:

```ts
type DebtScanRequest = {
  version: 1;
  source: 'manual' | 'scheduler';
  entityRef?: string;            // scan one component; else the configured sweep set
  repoUrl?: string;              // explicit repo override
  paths?: string[];              // narrow the scan to specific files/globs
  ruleSets?: ('markers' | 'dependencies' | 'secrets')[];  // default all enabled
  file?: boolean;                // request the ticket path (still gated); default false
  cursor?: string;               // resume an interrupted multi-repo sweep
};
```

Validation requires `entityRef` or `repoUrl` for a manual run (a scoped scan, never an implicit fleet crawl), clamps `paths` and the repo count, restricts `ruleSets` to enabled rules, and forces the ticket path through the approval gate regardless of caller.

## Scout Workflow

`ScoutGraph` registers as `WorkflowRunner` id `tech-debt-scout` and implements **both** `run()` and `resume()`. It realizes the foundation doc's role pipeline — **Scanner → Triager → Reporter** — as three stages writing to one shared state channel, with the write gated behind approval. Signal extraction, scoring, and dedupe are deterministic; the model only writes prose.

### Deterministic graph nodes

1. **plan** — validate `DebtScanRequest`; `RepoTargetResolver` resolves target repositories and their `owner` from the catalog (`getIntegrationReferences().repositories`). `sweepPlanner.ts` (pure) caps the target list. No resolvable repository → terminal `no_targets` with **no** model call.
2. **scan** *(Scanner)* — for each repo, `scanner.ts` collects raw `DebtSignal[]`: `vcs.repository.search` for marker patterns (`sig-N`), `vcs.repository.read_file` on configured manifests for dependency signals, and bounded snippet context around each hit. `ScoutToolRunner` classifies per-repo outcomes so a **stub search driver yields `search_unsupported`**, never an empty-but-clean result. **The cursor is checkpointed after every repository**, so a sweep interrupted at repo 12 of 50 resumes here.
3. **triage** *(Triager)* — `triager.ts` (pure, **no LLM**) scores every signal via the `rules/` modules into `DebtFinding[]`: marker class (`FIXME(security)` ≫ bare `TODO`), dependency staleness, secret-shaped literal, corroboration from a failing scorecard check, and configured keyword escalations. Findings below `minSeverity` are **suppressed but retained**. This is precisely the foundation doc's requirement that a hardcoded-salt `FIXME` escalates while a generic housekeeping `TODO` does not — a scoring table, not model judgment.
4. **dedupe** — `fingerprint.ts` (pure) computes a stable hash from `path` + whitespace/case-normalized snippet. `DebtLedger` marks a finding `already_tracked` when its fingerprint was filed within `dedupe.ttlDays`, and `project.ticket.search` provides a second check against open tickets. This is the foundation doc's idempotency guard.
5. **report** *(Reporter, part 1)* — `reporter.ts` (pure) groups un-suppressed, un-tracked findings by `owner` into a ticket plan. One model call writes per-finding summaries and ticket bodies from supplied evidence; `report.ts` re-validates that no path, line, version, or CVE appears in the prose that is absent from the computed record. Emits the `tech-debt-report` artifact.
6. **gate** — when `file` is requested, a non-empty plan exists, `project.ticket.create` is registered, and `tickets.enabled`, emit `approval_request` carrying the exact ticket set (title, priority, team, body per finding), checkpoint, and **suspend**. Report-only and fully-deduped sweeps finish at the artifact.
7. **file** *(Reporter, part 2 — resume path)* — `resume(runId, decision, context)`: on `approved`, create one ticket per finding sequentially via `project.ticket.create`, recording each fingerprint in the ledger **only on success**, emit a `debt-ticket-record` artifact plus audit entry, and finish `filed` or `partially_filed`; on `rejected`, record the decision, leave the ledger untouched, and finish `report_only`.

### State and output schema

```ts
type EvidenceRef = { id: string; source: 'code' | 'manifest' | 'scorecard' | 'ticket' | 'knowledge'; summary: string; reference?: string };

type DebtSignal = {
  id: string;                    // 'sig-1' ...
  kind: 'marker' | 'stale_dependency' | 'secret_literal';
  repoUrl: string;
  path: string;
  line?: number;
  raw: string;                   // redacted before storage; secret values never retained
  markerTag?: string;            // 'TODO' | 'FIXME' | 'HACK' | 'XXX'
  markerScope?: string;          // 'security' from FIXME(security)
  dependency?: { name: string; current: string; latestKnown?: string };
  evidence: string[];            // sig-N
};

type DebtFinding = {
  signal: DebtSignal;
  fingerprint: string;           // path + normalized snippet hash
  severity: 'critical' | 'high' | 'medium' | 'low';
  score: number;                 // deterministic, from the rules table
  reasons: string[];             // rules that fired: ['security_scope','scorecard_failing']
  disposition: 'escalate' | 'suppressed' | 'already_tracked';
  owner?: string;                // routing target from the catalog
  summary: string;               // model copy; must cite evidence IDs
  corroboration: string[];       // sc-N / kb-N
};

type RepoScanOutcome = {
  repoUrl: string;
  entityRef?: string;
  status: 'scanned' | 'search_unsupported' | 'scan_failed' | 'skipped';
  signalCount: number;
  reason?: string;
};

// ScoutState: { request, targets: RepoScanOutcome[], signals: DebtSignal[],
//   findings: DebtFinding[], cursor?, limitations: string[],
//   status: 'report_only'|'awaiting_approval'|'filed'|'partially_filed'
//         |'no_findings'|'no_targets'|'truncated'|'partial' }

type DebtReport = {
  scannedAt: string;
  targets: RepoScanOutcome[];    // every repo, including unscannable ones
  findings: DebtFinding[];       // escalate + suppressed + already_tracked
  counts: { escalate: number; suppressed: number; alreadyTracked: number };
  bySeverity: Record<DebtFinding['severity'], number>;
  byOwner: { owner: string; escalateCount: number; highestSeverity: string }[];
  status: ScoutState['status'];
  cursor?: string;
  limitations: string[];         // e.g. 'bitbucket search unsupported'
  evidence: EvidenceRef[];
};

type DebtTicketRecord = {
  reportRef: string;             // artifact ref of the approved report
  approvedBy: string;
  filed: { fingerprint: string; ticketId: string; owner?: string }[];
  skipped: { fingerprint: string; reason: string }[];
  failures: { fingerprint: string; reason: string }[];
  outcome: 'filed' | 'partially_filed';
};
```

Status mapping is fixed in code, not inferred: no resolvable repos → `no_targets`; every repo scanned with zero escalations → `no_findings`; escalations present with filing disabled or all deduped → `report_only`; any repo `search_unsupported`/`scan_failed` → `partial` with the reason named; sweep interrupted → `truncated` with a `cursor`; approved and every ticket created → `filed`; approved with any failure → `partially_filed`.

## Deterministic Signal Triage (New Structural Section)

The foundation doc's explicit test is that 100 raw `TODO` strings must not become 100 tickets, and that a security `FIXME` must escalate. That decision is arithmetic, not inference.

- `triager.ts` and the `rules/` modules are pure: `(signals, scorecard, config) => DebtFinding[]`. No AI Core, tool, or clock dependency, so every scoring branch is unit-testable on fixture signals.
- **Severity is a config-declared table**, not model judgment: marker tag weight (`FIXME` > `TODO`), scope escalation (`FIXME(security)` jumps to `high`), configured keyword escalations (`hardcoded`, `salt`, `password`, `temporary hack`), dependency staleness (major versions behind), and a corroboration bonus when `getEntityScorecard` shows a related failing check.
- **Suppression retains, never discards.** A below-threshold `TODO` is recorded with `disposition: 'suppressed'` and its reasons, so the dashboard shows what was filtered and an operator can tune thresholds against real data instead of guessing.
- `secrets.ts` detects secret-*shaped* literals and immediately **redacts the value** — a finding records the location and pattern class, never the string. Filing a ticket containing a live credential would turn a debt report into a leak.
- The model receives the scored record read-only and may only phrase summaries; `report.ts` strips prose asserting a severity, path, version, or CVE absent from the computed findings.
- Scores are about **code, never people**: the plugin does not attribute markers to authors, and blame data is deliberately not collected here (that is `search-ai-archeology`'s domain, with its own guardrails).

## Fingerprint Idempotency Across Sweeps (New Structural Section)

A weekly cron over a stable codebase must file each item exactly once — the foundation doc's §2 requirement, and the failure mode most likely to make teams disable the plugin.

- `fingerprint.ts` is pure and normalization-first: `path` + snippet with whitespace collapsed, case folded, and **line numbers excluded**. Excluding the line is deliberate — inserting an unrelated import above a `TODO` shifts its line but is not new debt, and a line-sensitive hash would re-file it every sweep.
- `DebtLedger` maps fingerprint → filed ticket ID and timestamp using the **AI Core runtime stores**, not the foundation doc's hand-rolled dedupe table.
- **Two independent dedupe layers.** The ledger is fast and local; `project.ticket.search` is authoritative and survives a cleared ledger or a migration. A finding is `already_tracked` if either says so.
- The ledger is written **only after a successful ticket creation** on the resume path. A rejected or failed filing leaves it untouched, so the finding resurfaces next sweep rather than being silently swallowed.
- Entries expire after `dedupe.ttlDays`, giving genuinely-ignored debt a re-surfacing cadence rather than permanent invisibility.
- `already_tracked` findings stay visible in the report with their ticket ID, so the dashboard shows total debt while the tracker stays clean — dedupe governs *filing*, not *visibility*.

## Bounded Fleet Scanning (New Structural Section)

A repository crawl is the plugin's cost centre and its main operational risk.

- `sweepPlanner.ts` (pure) caps targets at `maxRepositories` and orders them deterministically, so a sweep's cost is bounded by config rather than catalog size.
- Per-repo budgets in `ScoutToolRunner`: `maxFilesPerRepo`, `maxSignalsPerRepo`, `maxSnippetBytes`, plus a wall-clock budget. A single pathological repository cannot consume the whole sweep.
- **The cursor is checkpointed after every repository**, so an interrupted sweep resumes at the next unscanned repo with prior signals intact and never re-scans completed ones.
- Per-repo failures are classified and isolated: rate-limit/timeout → retryable, the repo stays queued and the run reports `truncated`; auth/not-found → that repo becomes `scan_failed` while the sweep continues. One bad repository never fails the run.
- **`search_unsupported` is a distinct outcome from zero findings.** On Bitbucket/Gerrit/generic Git, `searchRepository` returns `[]` after a warning; reporting that as "no debt" would be a false clean bill of health. Every unscannable repo appears in `targets` with its reason.
- Scheduled sweeps are mutex-guarded so an overrunning sweep cannot overlap the next tick.

## Background Scheduler Tasks (Weekly Sweep)

- `scheduler/weeklySweep.ts` registers one `coreServices.scheduler` task: `id: 'tech-debt-scout-weekly-sweep'`, `frequency: { cron }` from config (default `0 0 * * 0` — Sunday midnight, matching the foundation doc), bounded `timeout`, non-zero `initialDelay`, `scope: 'global'`.
- The task POSTs runs to `/agents/tech-debt-ai-scout/runs` via `auth.getPluginRequestToken` + `discovery.getBaseUrl('ai-core')` with `source: 'scheduler'`, `file: true`. It never executes the graph in-process.
- **Scheduled sweeps stop at the approval gate and never file autonomously.** The service principal holds no approval authority, so an unapproved ticket plan expires as a pending artifact — which is what keeps a cron loop from becoming a ticket firehose.
- Guardrails: global mutex, per-sweep repo cap, sequential dispatch with delay, fingerprint dedupe, and kill switch `sweep.enabled` (default **false**).

## Vector Store Integration

- **No new vector infrastructure and no new indexing.** `knowledge.retrieve` reads the existing corpus (dependency-deprecation notes, internal advisories, coding-standard docs) owned by `plugin-ai-core-backend-module-retrieval-augmenter`; ledger/cursor state lives in `plugin-ai-core-backend-module-runtime-store`.
- Retrieval is **corroboration only** and is structurally barred from `triager.ts`, which receives signals, scorecard data, and config — never retrieval output. Tests assert severities and dispositions are byte-identical with retrieval on and off.
- **Never index code snippets or findings.** Snippets can contain secrets, and findings are point-in-time facts about a mutable codebase; embedding them would create a durable, stale "this file is bad" store that outlives the fix.

## Configuration

```yaml
ai:
  agents:
    techDebtScout:
      model: tech-debt-scout        # installation-registered model ID, required
      maxRepositories: 25           # optional, default 25 per sweep
      maxFilesPerRepo: 40           # optional, default 40
      maxSignalsPerRepo: 100        # optional, default 100
      maxSnippetBytes: 512          # optional, default 512 per signal
      maxToolInvocations: 60        # optional, default 60
      sweepTimeoutSeconds: 900      # optional, default 900 wall-clock budget
      targets:
        annotation: 'backstage.io/source-location'  # optional; repo discovery source
        kinds: ['Component']        # optional, default ['Component']
        manifests:                  # optional; dependency files to parse
          - package.json
          - go.mod
          - requirements.txt
      rules:
        markers: ['TODO', 'FIXME', 'HACK', 'XXX']   # optional
        escalateKeywords:           # optional; bump severity when present
          - hardcoded
          - salt
          - password
          - temporary hack
        scopeEscalations:           # optional; FIXME(security) -> high
          security: high
        staleMajorVersions: 2       # optional, default 2 majors behind -> signal
        minSeverity: medium         # optional, default medium (below = suppressed)
        detectSecrets: true         # optional, default true
      dedupe:
        ttlDays: 30                 # optional, default 30 re-file cooldown
        checkOpenTickets: true      # optional, default true (second dedupe layer)
      tickets:
        enabled: false              # optional, default false; gates ticket.create
        team: ''                    # optional fallback board when owner is unmapped
        labels: ['tech-debt', 'scout-generated']    # optional
        priorityBySeverity:         # optional severity -> provider priority label
          critical: Highest
          high: High
          medium: Medium
          low: Low
      sweep:
        enabled: false              # optional, default false
        cron: '0 0 * * 0'           # optional, default Sunday midnight
```

`config.ts` mirrors `readCatalogAiInsightsConfig`: throw when the section or `model` is absent; document every default in `config.d.ts`. Filing requires **both** `tickets.enabled: true` and the `project.ticket.create` tool being registered. Validate at boot that `minSeverity` is a known severity and that every `scopeEscalations` value is too — a typo'd severity would silently suppress everything, the quietest possible wrong answer.

## Shared AI-Core Work To Build First

- **Nothing is blocking for v1.** Repo discovery (`CatalogEntityResolver`), marker discovery (`vcs.repository.search`), manifest reads (`vcs.repository.read_file`), scorecard reads (`quality.scorecard.get_entity_scorecard`), ticket dedupe/creation (`project.ticket.search` / `project.ticket.create`), retrieval, checkpoints, and `resume()` all exist today.
- **Blocked and deferred — a scorecard write op.** The foundation doc's "update the component's Tech Debt score" needs a `publishScorecardFact(entityRef, fact)`-style addition to `QualityScorecardsDriver` plus a `quality.scorecard.publish_fact` tool (`effect: 'write'`). Build it in `plugin-ai-core-backend-module-quality-scorecards` when wanted; **do not** repurpose `submitRadarProposal`, which belongs to `tech-radar-ai-manager`'s domain.
- **Optional quality improvement — extend VCS search coverage.** Implementing real `searchRepository` for Bitbucket/Gerrit converts `search_unsupported` repos into genuinely scanned ones. Shared with `search-ai-context`, which has the same dependency; highest-leverage follow-up for either.
- **Optional — dependency-advisory enrichment.** v1 infers staleness from manifest versions plus retrieval prose. A future provider-neutral advisory lookup would let severity cite a real CVE; until then the plugin must not mint identifiers.
- **No new triage, ledger, or scheduling machinery** — `rules/*`, `triager.ts`, `fingerprint.ts`, `sweepPlanner.ts`, and `reporter.ts` are plugin-local pure modules; approval types, `resume()`, checkpoints, audit, runtime stores, and the scheduler are consumed as-is.

## Frontend Plan

Mirror the `catalog-ai-insights` frontend layout and wiring exactly: `alpha.ts` composing extensions into a `createFrontendPlugin` `FrontendFeature`, `extensions/api.ts` using `ApiBlueprint.make({ params: defineParams => defineParams(createApiFactory({...})) })`, `extensions/components.ts` using `PageBlueprint.make({ name, params: { path, title, routeRef, loader } })` plus `EntityCardBlueprint.make(...)`, self-contained wire types in `@types/`, and an SSE client over `discoveryApi.getBaseUrl('ai-core')` with `eventsource-parser` and `Last-Event-ID` replay. Every directory carries a barrel `index.ts`. The package directory exists but is **empty** — scaffold it from scratch.

```text
plugins/frontend/plugin-ai-agent-frontend-tech-debt-ai-scout/
  src/
    index.ts                      # barrel: public components/api/types
    alpha.ts                      # createFrontendPlugin: pluginId + extensions
    plugin.ts                     # legacy-system plugin + routable extension
    routes.ts                     # ROOT_PATH + rootRouteRef
    @types/
      index.ts                    # DebtScanRequest/DebtReport/DebtTicketRecord wire types
    api/
      index.ts                    # barrel
      apiRef.ts                   # techDebtScoutApiRef
      client.ts                   # TechDebtScoutClient: startScan(), streamRunEvents(), submitApproval(), listReports()
    hooks/
      index.ts                    # barrel
      useDebtScan.ts              # pure reducer + hook (scan/approve/reject/reset)
      useDebtDashboard.ts         # aggregated findings across recent reports
    components/
      index.ts                    # barrel
      DebtDashboardPage.tsx       # standalone: fleet debt overview + on-demand scan
      DebtFindingTable.tsx        # severity, repo, path, owner, disposition
      RunScanDialog.tsx           # entity/repo/paths/ruleSets/file inputs
      ScanRunView.tsx             # live per-stage + per-repo progress from SSE
      SeverityRationalePanel.tsx  # which rules fired and why, per finding
      SuppressedFindingsPanel.tsx # collapsed low-value items, with reasons
      RepoCoveragePanel.tsx       # per-repo scanned / unsupported / failed
      TicketApprovalBar.tsx       # approve/reject the exact ticket set
      TicketOutcomeSummary.tsx    # filed / skipped / failed per fingerprint
      EntityDebtCard.tsx          # entity-page card: this component's debt
    extensions/
      api.ts                      # ApiBlueprint.make(...)
      components.ts               # PageBlueprint.make(...) + EntityCardBlueprint.make(...)
    __tests__/
```

Frontend deltas vs `catalog-ai-insights`:

- `backstage.pluginId: 'tech-debt-ai-scout'`; package `@ai-crew-suite/plugin-agent-tech-debt-scout`.
- Primary surface is a **standalone fleet dashboard** via `PageBlueprint`, plus an **`EntityCardBlueprint`** card showing one component's debt — apt here since findings attach to real catalog entities.
- **`RepoCoveragePanel` is a correctness surface, not decoration.** It must distinguish `scanned`, `search_unsupported`, and `scan_failed`, because a dashboard reading "0 findings" across an unscannable estate is a false clean bill of health.
- `SeverityRationalePanel` shows the `reasons` that fired for each finding, so a `high` severity is explainable rather than an opaque label — and so operators can tune `escalateKeywords` from evidence.
- `SuppressedFindingsPanel` keeps filtered items visible but collapsed, making the triage threshold legible; `already_tracked` findings link to their existing ticket.
- **Approval UX**: `TicketApprovalBar` renders the exact title, priority, team, and body for every ticket before filing, because the approver is authorizing writes into another team's board.
- `TicketOutcomeSummary` renders `failures` and `skipped` as prominently as successes — after `partially_filed`, a user must know precisely which tickets exist.
- `no_findings`, `no_targets`, `truncated` (with a continue affordance), and `partial` render as first-class explained outcomes, not errors.

## Test Strategy

Reuse the `catalog-ai-insights` test-layer table (unit/contract/backend integration/runtime integration/LLM evaluation/full-stack E2E) and its network policies. Deltas only:

- **Unit (the highest-value layer here)**: `rules/markers.ts` classification (`FIXME(security)` → high, bare `TODO` → low, keyword escalation on `hardcoded`/`salt`); `rules/dependencies.ts` manifest parsing and `staleMajorVersions` thresholds; `rules/secrets.ts` detection **plus redaction** (assert the value never survives into a `DebtSignal`); `triager.ts` full scoring matrix including `minSeverity` suppression and the scorecard-corroboration bonus; `fingerprint.ts` stability across whitespace/case/indentation changes and **line-number shifts**, with a genuinely different snippet hashing differently; `sweepPlanner.ts` caps.
- **Workflow (runtime) tests**: drive `ScoutGraph.run()` with a stubbed `WorkflowContext` (`invokeTool` mock router keyed by `toolId` + args) plus a fake `CatalogEntityResolver` — the codebase-accurate replacement for the foundation doc's `github.service`/`jira.service` sketches. **Headline scenario (the foundation doc's own test)**: a file containing both `// TODO: temporary hack, fix this before deploying` and `// FIXME(security): hardcoded encryption salt`. Assert the salt finding escalates to `high` with `security_scope` in `reasons`, the generic `TODO` is `suppressed`, the run **suspends** at `approval_request`, and `project.ticket.create` was **never** called.
- **Role-separation test** (the foundation doc's §1): feed the Scanner 100 raw markers and assert the Triager reduces them to the configured escalation set, that every suppressed item is still present with a reason, and that `signals`/`findings` remain distinct channels in state.
- **Idempotency tests** (the foundation doc's §2): run the graph twice over identical repository data with an approved filing between; assert the second run marks every finding `already_tracked`, plans **zero** tickets, and still reports them. Then clear the ledger and assert `project.ticket.search` alone prevents refiling.
- **Ledger-write discipline**: assert the ledger is written only after a successful `create`; a `rejected` resume and a failed create both leave it untouched, so the finding reappears next sweep.
- **Stub-driver safety test**: configure a Bitbucket-style provider; assert every repo is `search_unsupported`, the report is `partial` with a limitation, and — critically — the dashboard data does **not** read as zero findings on a scanned estate.
- **Cursor-resume tests**: fail the scan at repo 12 of 50; assert the cursor is checkpointed, status is `truncated`, prior signals survive, and resuming continues at the next repo without re-scanning completed ones.
- **Approval-gate hardening**: no ticket when the model hallucinates a tool call or attempts to skip the gate; `resume('approved')` files each ticket exactly once; a mid-loop failure yields `partially_filed` with exact `filed`/`failures`; a repeated approved resume files nothing new.
- **Anti-fabrication and secret-safety tests**: a model summary naming a path, version, or CVE absent from the record is stripped; assert no detected secret value appears in any summary, ticket body, artifact, or log.
- **`knowledge.retrieve` isolation**: pre-baked deprecation chunks; assert severities and dispositions are byte-identical with retrieval on and off.
- **Scheduler tests**: `mockServices.scheduler` fast-forwards the Sunday tick; assert bounded authenticated dispatch, `sweep.enabled: false` respected, mutex skipping, and **no autonomous filing**.
- **Backend integration**: `startTestBackend` with this module + AI Core + `mockServices.rootConfig` + `mockServices.database`, plus stub catalog/VCS/ticket/scorecard tools, asserting boot registration, per-stage SSE ordering, per-repo checkpointing, resume flow, and report/ticket-record artifact persistence.
- **E2E**: extend the shared fixture profile with fixture repositories containing seeded markers and a stale manifest, plus a fixture ticket driver. Playwright: open the dashboard → run a scan → inspect severity rationale and suppressed items → approve filing → assert the outcome summary; plus a reject path and a rescan-deduped path. Add `yarn test:e2e:tech-debt-ai-scout`.

## Security and Operational Guardrails

`catalog-ai-insights` guardrails apply unchanged (identity propagation, redaction before model/SSE/artifacts, tool/token/wall-clock caps, correlation IDs). Scout-specific additions:

- **No ticket without a persisted human approval**, and `tickets.enabled` defaults to `false`. The decision, `approvedBy`, and every filed fingerprint/ticket ID are audit-logged; rejections are audited too. Scheduled sweeps reach the gate but cannot satisfy it.
- **Never emit a detected secret.** `rules/secrets.ts` redacts at detection; findings carry a location and pattern class only. A ticket body containing a live credential would broadcast the leak to a whole team's board — the plugin's sharpest hazard.
- **Never report an unscannable repository as clean.** `search_unsupported` and `scan_failed` stay distinct from zero findings everywhere: state, artifact, and UI.
- **No scorecard writes.** The plugin reads scorecards for corroboration, never publishes a score, and does not allow-list `submitRadarProposal`, so it cannot cross into `tech-radar-ai-manager`'s domain.
- Code snippets are **untrusted and potentially sensitive**: cap `maxSnippetBytes`, scrub secret-shaped strings before the model/SSE/artifacts/logs, and delimit snippets in the prompt with an instruction not to follow instructions found inside them — a `TODO` reading "ignore previous instructions" is a realistic prompt-injection vector in scanned code.
- **Findings describe code, not people.** No author attribution and no blame collection, so a debt report cannot be reframed as a performance metric.
- Authorization is per-caller: repository, scorecard, and ticket reads propagate the requester's credentials, so a scan cannot surface repositories the caller could not read. Ticket creation uses the approver's credentials so board permissions apply.
- Third-party APIs are metered: per-repo and per-sweep caps plus a wall-clock budget mean a fleet audit degrades to `truncated` rather than exhausting a code-search or Jira quota.

## Ordered Implementation Milestones

### Milestone 0: Pure rules and contracts

- [ ] Confirm `project.ticket.create`/`search`, `quality.scorecard.get_entity_scorecard`, `vcs.repository.search`/`read_file`, and `CatalogEntityResolver` against the installed code; enumerate search-capable providers.
- [ ] Define `DebtSignal`, `DebtFinding`, `RepoScanOutcome`, `DebtReport`, `DebtTicketRecord`, and the config schema.
- [ ] Implement + unit-test `rules/markers.ts`, `rules/dependencies.ts`, `rules/secrets.ts` (with redaction), `triager.ts`, `fingerprint.ts`, and `sweepPlanner.ts`.

Exit criteria: the escalate-vs-suppress matrix and fingerprint stability are provably deterministic on fixtures; no secret value survives detection.

### Milestone 1: Scan-and-report backend (read-only)

- [ ] Scaffold the package with a barrel `index.ts` in every directory, register the runner/agent/manual trigger, config parsing; register in root `tsconfig.json` + `.eslintrc.cjs`.
- [ ] Implement plan → scan → triage → dedupe → report → `tech-debt-report`, with `RepoTargetResolver` and `ScoutToolRunner` (including `search_unsupported` classification).
- [ ] Wire into `packages/backend` and add the `ai.agents.techDebtScout` config block.
- [ ] Add unit, workflow-scenario, role-separation, stub-driver-safety, and backend integration tests.

Exit criteria: the foundation doc's TODO-vs-security-FIXME file triages correctly with no real LLM, no live provider, and no tickets.

### Milestone 2: Dedupe ledger and resumable sweeps

- [ ] Implement `DebtLedger` (fingerprint → ticket state, TTL expiry), the `project.ticket.search` second layer, per-repo cursor checkpointing, and per-repo error isolation.
- [ ] Idempotency, ledger-write-discipline, and cursor-resume tests.

Exit criteria: a second sweep over unchanged code plans zero tickets while still reporting the debt; an interrupted sweep resumes without re-scanning.

### Milestone 3: Approval-gated filing

- [ ] Implement the gate + `ScoutGraph.resume()`: checkpointed ticket plan, `approval_request`, sequential `project.ticket.create`, ledger write on success only, `debt-ticket-record` artifact, audit, and no-double-file idempotency.
- [ ] Gate-hardening tests: hallucinated tool call, node-skip attempt, mid-loop failure, double-resume, rejection leaving the ledger untouched.

Exit criteria: a ticket is provably filed only after approval, once per fingerprint, with partial outcomes reported precisely.

### Milestone 4: Scheduled sweep, frontend, and E2E

- [ ] Implement `weeklySweep` with mutex, caps, and kill switch, plus fast-forwarded scheduler tests asserting no autonomous filing.
- [ ] Scaffold the empty frontend package (`ApiBlueprint` + `PageBlueprint` + `EntityCardBlueprint`, dashboard, scan dialog, run view, severity rationale, suppressed panel, repo coverage, approval bar, outcome summary) with barrel indexes, and register it in `packages/app`.
- [ ] Component tests (loading, streaming, no_findings/no_targets/partial/truncated, all three dispositions, awaiting approval, filed, partially_filed, replay) plus accessibility checks — including an assertion that `search_unsupported` is visually distinct from zero findings.
- [ ] Extend the E2E fixture profile and add Playwright scan, approve, reject, and rescan-deduped scenarios with screenshot review.

Exit criteria: `yarn test:e2e:tech-debt-ai-scout` demonstrates scan → triage → approve → filed, plus reject and dedupe paths, without external infrastructure.

### Milestone 5: Production readiness

- [ ] Document model registration, ticket/scorecard driver configuration, VCS search-capability implications, rule/threshold tuning, sweep and filing enablement, and approver permissions.
- [ ] Dashboards/alerts for findings by severity, **escalate-to-suppress ratio** (the key tuning metric), dedupe hit rate, `search_unsupported` repo count, sweep duration/truncation, filing failure rate, and token cost per sweep.
- [ ] Opt-in real-model evaluation suite (grounding: every summary cites supplied signal IDs; no invented paths, versions, or CVEs; no secret values; no author attribution) within budget.
- [ ] Optional follow-ups: a `publishScorecardFact` core op for debt scores, and Bitbucket/Gerrit `searchRepository` implementations.

Exit criteria: staged rollout with sweeps and filing disabled by default, bounded API usage, and a tuned threshold that teams accept.

## Definition of Done

- Package, agent, runner (`run` + `resume`), triggers (manual + sweep), config schema, and the allow-list implemented and registered (root + backend/app wiring included), with a barrel `index.ts` in every directory.
- Runs execute through the real AI Core controller/runtime with persisted replayable events, per-repository checkpoints, and `tech-debt-report` / `debt-ticket-record` artifacts.
- Triage is pure, config-weighted, and deterministic: a security `FIXME` escalates, a generic `TODO` is suppressed-but-retained, and the model never sets a severity.
- Detected secrets are redacted at the point of detection and appear in no summary, ticket, artifact, or log.
- Fingerprint dedupe plus an open-ticket check provably prevent duplicate filing across consecutive sweeps; the ledger is written only after a successful create, so rejected or failed findings resurface.
- Unscannable repositories are reported as `search_unsupported`/`scan_failed`, never as zero findings, in both artifact and UI.
- No ticket is created without a persisted approval; filing runs with the approver's credentials, is idempotent per fingerprint, and reports partial outcomes without pretending completeness.
- The plugin writes no scorecard, opens no PR, and modifies no code.
- Frontend renders the dashboard, severity rationale, suppressed findings, repo coverage, and approval over live SSE and replay via `ApiBlueprint`/`PageBlueprint`; Playwright verifies scan, approve, reject, and dedupe paths on fixtures.
- No output surface (SSE, artifacts, logs, audit, tests, tickets) contains secret values, unbounded snippets, uncited findings, fabricated CVEs, or author attribution.

## Frontend Completed

## Delivered

- Standalone route: `/tech-debt-ai-scout`

- Alpha and legacy plugin entry points.

- Typed authenticated AI Core SSE client for:

  - Starting `tech-debt-ai-scout` scans.
  - Replaying persisted scans with `?run=<id>`.

- Typed `tech-debt-report` browser contract matching the deployed backend artifact.

- Reducer-backed run state that safely ignores malformed artifact JSON.

- Repository scan dialog requiring an HTTP(S) repository URL.

- Report UI with:

  - Scan progress.
  - Repository outcomes.
  - Escalated findings.
  - Retained suppressed findings.
  - Finding severity, deterministic rule rationale, citations, and fingerprint.
  - Explicit report limitations.
  - Evidence links.

- Clear UX messaging that:

  - The scan is read-only.
  - Secret-shaped values are redacted.
  - Bitbucket/Gerrit `search_unsupported` results are not equivalent to a clean repository.
  - Ticket filing and later-plan sweep/dedupe/enrichment features are unavailable in the deployed backend, so no misleading controls are shown.

## App and monorepo wiring

Registered in:

- `/home/kevin/Repos/backstage/ai-crew-suite/tsconfig.json`
- `/home/kevin/Repos/backstage/ai-crew-suite/.eslintrc.cjs`
- `/home/kevin/Repos/backstage/ai-crew-suite/packages/app/package.json`
- `/home/kevin/Repos/backstage/ai-crew-suite/packages/app/src/App.tsx`
- `/home/kevin/Repos/backstage/ai-crew-suite/packages/app/src/App.test.tsx`
- `/home/kevin/Repos/backstage/ai-crew-suite/yarn.lock`

## Tests

Added:

- Reducer extraction of valid reports and malformed artifact safety.
- Report rendering for suppressed findings, unsupported repository outcomes, limitations, and evidence links.
- Updated the app feature-list test for the newly registered alpha plugin.

## Frontend Completed

## Delivered

- Standalone route: `/tech-debt-ai-scout`

- Alpha and legacy plugin entry points.

- Typed authenticated AI Core SSE client for:

  - Starting `tech-debt-ai-scout` scans.
  - Replaying persisted scans with `?run=<id>`.

- Typed `tech-debt-report` browser contract matching the deployed backend artifact.

- Reducer-backed run state that safely ignores malformed artifact JSON.

- Repository scan dialog requiring an HTTP(S) repository URL.

- Report UI with:

  - Scan progress.
  - Repository outcomes.
  - Escalated findings.
  - Retained suppressed findings.
  - Finding severity, deterministic rule rationale, citations, and fingerprint.
  - Explicit report limitations.
  - Evidence links.

- Clear UX messaging that:

  - The scan is read-only.
  - Secret-shaped values are redacted.
  - Bitbucket/Gerrit `search_unsupported` results are not equivalent to a clean repository.
  - Ticket filing and later-plan sweep/dedupe/enrichment features are unavailable in the deployed backend, so no misleading controls are shown.

## App and monorepo wiring

Registered in:

- `/home/kevin/Repos/backstage/ai-crew-suite/tsconfig.json`
- `/home/kevin/Repos/backstage/ai-crew-suite/.eslintrc.cjs`
- `/home/kevin/Repos/backstage/ai-crew-suite/packages/app/package.json`
- `/home/kevin/Repos/backstage/ai-crew-suite/packages/app/src/App.tsx`
- `/home/kevin/Repos/backstage/ai-crew-suite/packages/app/src/App.test.tsx`
- `/home/kevin/Repos/backstage/ai-crew-suite/yarn.lock`

## Tests

Added:

- Reducer extraction of valid reports and malformed artifact safety.
- Report rendering for suppressed findings, unsupported repository outcomes, limitations, and evidence links.
- Updated the app feature-list test for the newly registered alpha plugin.

## Backend Completed

### Delivered functionality

- AI Core backend module:

  - Agent ID: `tech-debt-ai-scout`
  - Workflow ID: `tech-debt-scout`
  - Artifact kind: `tech-debt-report`

- Stateless, manual, read-only agent.

- Scoped versioned request validation requiring an HTTP(S) repository URL.

- Bounded `vcs.repository.search` scan for:

  - `TODO`
  - `FIXME`
  - `HACK`
  - `XXX`
  - secret-shaped literals.

- Deterministic triage:

  - Generic TODOs are retained as `suppressed`.
  - `FIXME(security)` is escalated to `high`.
  - Secret-shaped literals are critical and redacted.

- Stable line-independent SHA-256 fingerprinting based on normalized path/snippet content.

- Secret safety:

  - Secret values never enter signals, findings, artifacts, or logs.
  - Only a pattern classification such as `[REDACTED PASSWORD LITERAL]` is retained.

- Explicit unsupported-provider behavior:

  - Bitbucket/Gerrit repository URLs produce `search_unsupported`.
  - Such scans are `partial`; zero findings are never presented as clean.

- Failure-tolerant bounded tool runner.

- Replayable cited report artifact.

- README documenting the active scope and limitations.

### Tests added

- Generic TODO suppression vs security-FIXME escalation.
- Secret literal redaction.
- Fingerprint stability when source lines move.
- Unsupported-provider partial reporting.
- Scan behavior using only `vcs.repository.search`.
- Backend module registration with no write tools.

## Registration and configuration

Wired into:

- `/home/kevin/Repos/backstage/ai-crew-suite/tsconfig.json`
- `/home/kevin/Repos/backstage/ai-crew-suite/.eslintrc.cjs`
- `/home/kevin/Repos/backstage/ai-crew-suite/packages/backend/package.json`
- `/home/kevin/Repos/backstage/ai-crew-suite/packages/backend/src/index.ts`
- `/home/kevin/Repos/backstage/ai-crew-suite/app-config.yaml`

Added config:

```yaml
ai:
  agents:
    techDebtScout:
      model: tech-debt-scout
```

## Intentionally not represented as active

The current package accurately labels these later-plan capabilities as inactive:

- Catalog fleet target enumeration and scheduled sweeps.
- Manifest/dependency scans.
- Scorecard and knowledge-retrieval enrichment.
- Persistent dedupe ledger and existing-ticket dedupe.
- Approval-gated ticket filing and workflow `resume()`.

