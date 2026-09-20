# TechDocs AI Janitor Implementation Plan

## Overview

This plugin automatically parses your markdown documentation trees to identify and patch out-of-date setup commands, dead external URLs, and stale code syntax patterns.

Traditional documentation tools evaluate files in structural isolation. While version control system (**VCS**) platforms handle isolated repository workflows well, they lack an overarching organizational context.

The `techdocs-ai-janitor` is an intelligent, graph-driven plugin for Spotify **Backstage**. By leveraging **LangGraph**, it transitions from static linting to multi-turn, stateful engineering reasoning. Instead of analyzing code files in a vacuum, the plugin utilizes the **Backstage Software Catalog**, **Search Telemetry**, and **TechDocs storage buckets** to autonomously detect architectural drift, heal broken ecosystem links, map shifting team ownership, and proactively resolve documentation gaps across the entire enterprise.

## Features

### **Feature 1:** Cross-Service Architectural Drift Resolution

- **The Problem**: A core infrastructure service updates an internal API schema. Dozens of consumer services have outdated integration guides in their TechDocs.
- **The LangGraph Win**: The graph acts on Catalog lifecycle relationships (`dependsOn`, `providesApi`). When a schema mutation occurs, the node navigates the dependency tree, evaluates the downstream TechDocs files in the storage bucket, rewrites code invocation blocks, and opens automated PRs across all affected repositories.

### **Feature 2:** Intelligent "Intent-Aware" Dead Link Deflection

- **The Problem**: Hardcoded internal links to legacy Confluence paths, retired codebases, or legacy Slack channels rot over time, returning dead links or 404s.
- **The LangGraph Win**: When a link-checker edge in the graph flags a failure, a dedicated **Resolution Agent Node** queries the Backstage global search index and catalog history to infer what the developer _meant_ to link to. If a service was deprecated in favor of a newer system, the agent automatically edits the source Markdown file to reference the active Backstage portal resource.

### **Feature 3:** Demand-Driven Documentation (Telemetry Ingestion)

- **The Problem**: Teams write documentation they _think_ developers need, while actual knowledge gaps go unaddressed.
- **The LangGraph Win**: The plugin acts as a consumer of the **Backstage Search Telemetry API**. If the data shows that developers are repeatedly entering queries like _"how to configure mTLS token rotation"_ and hitting empty results or high bounce rates, the graph initializes. It researches the system configuration, outlines a missing TechDocs section, and assigns an issue or a pre-populated draft PR directly to the owning engineering team.

### **Feature 4:** Governance & Component Metadata Enrichment

- **The Problem**: System ownership (`spec.owner`) shifts frequently during company reorganizations, causing PagerDuty escalation documentation, team names, and communication links within TechDocs files to rapidly go out of date.
- **The LangGraph Win**: The graph matches TechDocs references against live entity metadata inside the Backstage Catalog. It automatically updates point-of-contact details, Slack channel hooks, and support workflows directly in the source Markdown files.

## Nodes & Operational Logic

- **Orchestrator Node**: Evaluates incoming trigger events (such as catalog updates, telemetry data spikes, or a scheduled cron execution) and sets the target state.
- **Researcher Node**: Queries the Backstage Catalog API, parses the downstream dependencies, reads live OpenAPI schemas, and cross-references them with the text stored in the target TechDocs bucket.
- **Writer Node**: Invokes targeted LLMs to perform code-to-text synthesis, rewrites outdated sections, fixes dead URLs, and populates the `proposed_patches` list.
- **Validation Node (The Conditional Edge)**: Runs markdown linters, checks formatting compliance rules, and validates compiled outputs against organizational standards. If compilation checks fail, it loops back to the Writer Node with the failure logs. If they pass, it passes execution to the pull request generation phase.

## Goal

Implement `@ai-crew-suite/plugin-agent-techdocs-janitor-backend` as an AI Core backend module that finds and drafts fixes for rotting documentation. It reads a component's TechDocs markdown, then runs **deterministic detectors** over it: dead internal/external links, ownership references that disagree with the live catalog (`spec.owner`, Slack/PagerDuty annotations), and integration snippets that drift from a dependency's current API. Each finding becomes a `JanitorDiscrepancy` citing an exact source range, and — where a confident replacement exists — an **anchored** `DocumentationPatch` validated to apply cleanly. Patches are proposals: they are surfaced for review and, once the VCS write tool lands, opened as an approval-gated PR. A paired frontend plugin renders the findings queue, per-file diffs, and the approval bar.

Reuse the architecture proven by `plugin-ai-agent-backend-catalog-ai-insights` (its `_IMPLEMENTATION.md` is the source of truth for repository conventions, workflow-runner mechanics, event contracts, monorepo wiring, and test-layer definitions). This plan documents only what differs: **deterministic markdown detectors**, **anchored patch generation with a validation loop**, **staged feature delivery against missing contracts**, and the **approval-gated documentation write**.

## Delivery Boundary

### In scope

- One component's documentation per run (or a bounded set of doc paths), via `/agents/techdocs-ai-janitor/runs`.
- Deterministic `scope → load → detect → resolve → patch → validate → gate` graph. Detection, source-range anchoring, patch application, and markdown validation are pure code; the model only rewrites the marked span and writes explanations.
- **Feature 4 (ownership/metadata drift)** and **Feature 2 (dead links)** in v1 — both fully buildable today against the catalog and VCS read tools.
- **Feature 1 (architectural drift)** in a reduced form: `getRelations` supplies the dependency graph and `vcs.repository.read_file` the current interface, so drift is *detected and reported*; cross-repository PR fan-out is out.
- A `JanitorReport` artifact with per-discrepancy citations plus optional `documentation-patch` artifacts carrying anchored unified diffs.
- A **self-correcting validation loop**: a patch failing markdown/link validation is fed back to the writer with the failure log, bounded by `maxRepairRounds`.
- Approval-gated deprecation/gap tickets via `project.ticket.create`, and — when `vcs.pull_request.create` lands — an approval-gated documentation PR.

### Explicitly out of scope for v1

- **Any autonomous source mutation.** No file is written and no PR opened without a persisted human approval, and the required write tool does not exist yet (see Prerequisites). v1 terminates at the patch artifact.
- **Feature 3 (telemetry-driven gaps).** The Backstage Search Telemetry API has no contract in this repo — no search tools, no telemetry driver for query/bounce data. Inventing one would produce fabricated "developers are asking about X" claims. Deferred with the seam documented.
- **Cross-repository PR fan-out** for a single upstream schema change. v1 analyzes one component per run; fleet-wide remediation needs the write tool plus a sweep, and is a v1.1 milestone.
- Rewriting whole documents or restructuring information architecture. Patches are **anchored span replacements** — a janitor, not a ghostwriter.
- Publishing to TechDocs storage buckets directly. The source of truth is the markdown in the repository; the plugin proposes changes there and lets the existing TechDocs pipeline rebuild.
- Asserting that an external URL is *permanently* dead from one probe, or inferring a replacement without a catalog/search match.

## Required Prerequisites

Contracts verified against the current codebase. The foundation doc supplies a LangGraph `JanitorState` sketch with `StateGraphArgs` channels; **the type shapes are useful and largely adopted below**, but the LangGraph-specific channel reducers must not be implemented — AI Core workflows use `WorkflowRunner` state, not `StateGraph` channels.

**All four of the earlier draft's gates are confirmed, but they do not block the same amount of work it implied.** Verified:

- **Catalog relation resolver — now EXISTS.** The draft called this shared work; `CatalogEntityResolver` has since landed with `getRelations`, `getEntitySummary`, and `getIntegrationReferences` (including a **`techdocsRef`** field parsed from `backstage.io/techdocs-ref`). Features 1 and 4 are therefore buildable today.
- **VCS write — CONFIRMED MISSING.** All four registered `vcs.*` tools are `effect: 'read'` (`get_metadata`, `read_file`, `search`, `pull_request.list`); `VcsDriver` has no write op. Patch *generation* works; patch *delivery* does not.
- **Search telemetry — CONFIRMED MISSING, and more thoroughly than the draft suggested.** There are **no `search.*` tools and no `techdocs.*` tools at all**, and the only "telemetry" in core is `ObservabilityDriver` (metrics/logs/traces for services — not search queries or bounce rates). Feature 3 has no data source whatsoever.
- **Events — CONFIRMED MISSING.** Zero references to `coreServices.events` / `eventsServiceRef` anywhere.

| Capability | Required contract | Current state | Required action |
| --- | --- | --- | --- |
| Doc location + entity context | `CatalogEntityResolver.getEntitySummary`, `getIntegrationReferences` (`techdocsRef`, `repositories`, `oncall`) | **Exists** | Resolve the docs source and the live ownership/on-call facts that Feature 4 compares against. Replaces ad-hoc annotation parsing. |
| Markdown source read | `vcs.repository.read_file`, `coreServices.urlReader` | **Exist**, `effect: read` | Read `docs/**` markdown at a pinned `ref` so anchors stay valid for the life of the run. |
| Doc discovery | `vcs.repository.search` | **Exists**, `effect: read`. **Driver quality uneven** — GitHub/GitLab/Azure implement real search; Bitbucket/Gerrit/generic Git return `[]` after a warning | Locate doc files when no explicit paths are given. On a stub driver, require explicit `paths` and record `discovery_unsupported` rather than reporting a clean document set. |
| Ownership truth (Feature 4) | `spec.owner` + Slack/PagerDuty annotations via the resolver | **Exists** | The live catalog is authoritative; documented owners/channels that disagree are the discrepancy. Fully buildable. |
| Internal link validation (Feature 2) | `getEntitySummary` for `catalog://`/entity links; `vcs.repository.read_file` for relative doc links | **Exists** | A relative link is dead if the target file is unreadable at `ref`; an entity link is dead if the entity does not resolve. Deterministic, no network probe needed. |
| External link validation (Feature 2) | Outbound HTTP probe | **Not available as a tool**, and deliberately not added | Classify external URLs as `unverified` rather than probing arbitrary hosts from the backend. Optional `urlReader` check only for hosts covered by configured integrations. Honest over guessy. |
| Replacement inference (Feature 2) | `CatalogEntityResolver` + `knowledge.retrieve` | **Exist** | A dead internal link is only *auto-replaced* when a catalog entity or indexed doc matches with high confidence; otherwise it stays a `recommendation` with no patch. |
| Dependency drift (Feature 1) | `getRelations({ relationTypes: ['dependsOn','providesApi'] })` + `vcs.repository.read_file` on the upstream interface | **Exist** | Detect documented snippets referencing symbols absent from the upstream interface. Report-only in v1. |
| **Feature 3 telemetry** | A search-query/bounce telemetry contract | **Absent entirely** — no `search.*` tools, no `techdocs.*` tools, `ObservabilityDriver` covers service metrics only | Defer. Keep `JanitorRequest.reason` discriminated so a `telemetry_gap` variant is additive. **Do not** approximate gaps from `knowledge.retrieve` misses — that is not demand data. |
| **Documentation PR (write)** | `vcs.pull_request.create` (**new, `effect: 'write'`**) | **Not present** — no write-capable VCS tool exists | Add `createPullRequest(repoUrl, { baseBranch, headBranch, title, body, files })` to `VcsDriver` + register the tool. **Shared with `alert-ai-tuner`, `scaffolder-ai-drift-detector`, and `scaffolder-ai-prd`** — build once in `plugin-ai-core-backend-module-vcs`. **Blocking for patch delivery only.** |
| Gap/drift tickets | `project.ticket.create` | **Exists**, `effect: 'write'` | Available fallback for delivery while the PR tool is missing: file a ticket carrying the patch diff so a human can apply it. Approval-gated. |
| Approval gate | `ApprovalRequest` / `ApprovalDecision`, `WorkflowRunner.resume()`, `CheckpointStore`, `AuditLogSink` | **Exist** | Implement `JanitorGraph.resume()`; checkpoint the frozen patch set; audit decision, actor, file paths, and patch hashes. |
| Event-triggered runs | An events subscription | **Missing** | Deferred; the sweep/manual paths cover v1. |
| Scheduled sweeps | `coreServices.scheduler` + `discovery` + `auth` | Available | Optional periodic doc audit, opt-in and mutex-guarded. |

## Package Shape

Backend module from the same template as `catalog-ai-insights`, with a `detectors/` directory (one per feature) mirroring the foundation doc's node roles. Every directory carries a barrel `index.ts` re-exporting its public surface, matching the reference plugin's export styling.

```text
plugins/backend/plugin-ai-agent-backend-techdocs-ai-janitor/
  package.json          # role: backend-plugin-module, pluginId: ai-core
  tsconfig.json
  config.d.ts
  README.md
  src/
    index.ts            # barrel: module default + public types
    module.ts           # registers runner, agent, triggers, optional sweep
    agent.ts            # TECHDOCS_JANITOR_AGENT_ID, tool allow-list, system prompt
    config.ts           # readTechDocsJanitorConfig (ai.agents.techDocsJanitor)
    workflow/
      index.ts          # barrel
      JanitorGraph.ts           # WorkflowRunner id 'techdocs-janitor' (run + resume)
      state.ts                  # JanitorState (entity, docs, discrepancies, patches)
      scope.ts                  # pure: request -> resolved docs targets + pinned ref
      markdown.ts               # pure: markdown -> addressable spans, links, snippets
      resolve.ts                # replacement inference (catalog/knowledge), confidence-gated
      patch.ts                  # pure: span + replacement -> anchored unified diff
      validate.ts               # pure: markdown/link/anchor validation -> Finding[]
      repair.ts                 # pure: findings -> bounded rewrite instructions
      report.ts                 # JanitorReport schema, validation, degradation
      deliver.ts                # approval-gated PR/ticket executor
    detectors/
      index.ts          # barrel
      ownership.ts              # Feature 4: doc owner/channel vs live catalog
      deadLinks.ts              # Feature 2: internal/entity link resolution
      apiDrift.ts               # Feature 1: documented symbols vs upstream interface
    scheduler/
      index.ts          # barrel
      docsSweep.ts              # optional coreServices.scheduler audit
      sweepPlanner.ts           # pure: catalog targets + caps -> dispatch plan
    services/
      index.ts          # barrel
      DocsTargetResolver.ts     # CatalogEntityResolver adapter: techdocsRef + repo + owner
      JanitorToolRunner.ts      # capped invokeTool facade, per-file error classing
      JanitorArtifactWriter.ts
    @types/
      index.ts          # barrel: shared discrepancy/patch/report contracts
    __tests__/
    workflow/__tests__/
    detectors/__tests__/
    scheduler/__tests__/
    services/__tests__/
```

- `createBackendModule` with `pluginId: 'ai-core'`, `moduleId: 'agent-techdocs-ai-janitor'`.
- `module.ts` deps: `coreServices.rootConfig`, `coreServices.logger`, `coreServices.scheduler`, `coreServices.urlReader`, `coreServices.discovery`, `coreServices.auth`, `catalogServiceRef`, plus `agentExtensionPoint`, `triggerExtensionPoint`, `workflowRunnerExtensionPoint`. **No new core service keys are introduced.**
- Package naming, scripts, Apache header, root `tsconfig.json` references, and `.eslintrc.cjs` role overrides follow `catalog-ai-insights` and `plugin-registration.md` verbatim (not repeated here).

## Monorepo And App Wiring

Same delegated-but-verified steps as `catalog-ai-insights` (see that plan's "Monorepo And App Wiring"). Deltas:

- **Backend load**: add `"@ai-crew-suite/plugin-agent-techdocs-janitor-backend": "workspace:^"` to `packages/backend/package.json` and the matching `backend.add(loadBackendFeature(import(...)))` line in `packages/backend/src/index.ts`.
- **Delivery is gated, detection is not.** With no `vcs.pull_request.create`, the plugin still detects and drafts; only delivery is unavailable. Configure `deliver.mode: 'ticket'` to route patches through `project.ticket.create` in the meantime, or `'none'` for report-only.
- **VCS driver choice affects discovery only.** On Bitbucket/Gerrit/generic Git, `vcs.repository.search` returns `[]`, so callers must pass explicit `paths`; the report records `discovery_unsupported` rather than implying the docs tree is clean. File reads work on every driver.
- **App config**: the module throws at boot without `ai.agents.techDocsJanitor.model`; add the config block (see Configuration). Sweeps need `sweep.enabled: true`; delivery needs `deliver.mode` plus the matching tool.
- **Frontend registration**: `plugins/frontend/plugin-ai-agent-frontend-techdocs-ai-janitor/` exists but is **empty** — scaffold it from scratch. Add the workspace dependency to `packages/app/package.json`, import its `/alpha` default export in `packages/app/src/App.tsx`, and extend plugin-ID expectations in `packages/app/src/App.test.tsx`.
- **Yarn PnP refresh**: `yarn install` after any `package.json` edit, then `yarn typecheck --force` / `yarn lint --force`.
## Agent Definition

```ts
{
  id: 'techdocs-ai-janitor',
  modelRef: config.modelRef,          // installation-registered ID, e.g. 'techdocs-janitor'
  workflowRef: 'techdocs-janitor',
  memory: 'none',                     // each run is a fresh snapshot of docs + catalog
  systemPrompt: TECHDOCS_JANITOR_SYSTEM_PROMPT,
  toolIds: [
    'vcs.repository.read_file',
    'vcs.repository.search',
    'vcs.repository.get_metadata',
    'knowledge.retrieve',
    'project.ticket.create',          // effect: 'write' — post-approval only
    // 'vcs.pull_request.create'      // effect: 'write' — NEW; add when it lands
  ],
  triggers: [
    { id: 'janitor-scan-on-demand', source: 'manual', agentId: 'techdocs-ai-janitor' },
    { id: 'janitor-docs-sweep', source: 'scheduler', agentId: 'techdocs-ai-janitor' },
  ],
}
```

- Read tools run freely. `project.ticket.create` is `effect: 'write'`, so AI Core pauses with an `approval_request` before it executes. `vcs.pull_request.create` is commented out because it **does not exist** — an unknown allow-list entry fails fast at boot, which is the correct behavior, so it is added only when the tool lands.
- Catalog access goes through the injected `CatalogEntityResolver`, not a tool.
- `memory: 'none'` — documentation drift must be judged against current catalog state; a carried-forward snapshot could report an already-fixed owner as stale.
- System prompt rules: discrepancies, their source ranges, and replacement values are supplied **pre-computed** and must be used verbatim; rewrite **only** the delimited span and never restructure surrounding content; never invent an owner, channel, URL, entity ref, or API symbol — if no replacement was supplied, leave the text and say a human must choose; cite `disc-N` for every finding and `cat-N`/`kb-N` for replacement evidence; preserve the document's existing markdown style (heading depth, list markers, code-fence language); describe an unverified external URL as *unverified*, never as broken.

## Run Input Contract

The generic `AgentRunInput.input.query` carries a versioned JSON payload. `reason` is discriminated so a `telemetry_gap` variant is additive when a telemetry contract lands.

```ts
type JanitorRequest = {
  version: 1;
  source: 'manual' | 'scheduler';
  reason: 'audit' | 'ownership_change' | 'dependency_change';  // 'telemetry_gap' reserved
  entityRef: string;             // required: the component whose docs are audited
  paths?: string[];              // explicit doc files; required on stub-search drivers
  ref?: string;                  // pin the commit/branch; defaults to the default branch
  detectors?: ('ownership' | 'dead_links' | 'api_drift')[];  // default: all enabled
  deliver?: boolean;             // request the delivery path (still gated); default false
};
```

Validation requires `entityRef`, caps `paths` count and per-file bytes, resolves and **pins `ref`** for the whole run so every anchor stays valid, restricts `detectors` to enabled ones, and forces delivery through the approval gate regardless of caller.

## Janitor Workflow

`JanitorGraph` registers as `WorkflowRunner` id `techdocs-janitor` and implements **both** `run()` and `resume()`. It realizes the foundation doc's node roles — **Orchestrator → Researcher → Writer → Validation (conditional edge) → delivery** — as stages over one `JanitorState`. Detection, anchoring, and validation are deterministic; the model rewrites only marked spans.

### Deterministic graph nodes

1. **scope** *(Orchestrator)* — validate `JanitorRequest`; `DocsTargetResolver` resolves the entity, its `techdocsRef`/repository, and live ownership facts, then pins `ref` via `vcs.repository.get_metadata`. Doc paths come from `paths` or `vcs.repository.search`; a stub search driver with no explicit `paths` terminates as `discovery_unsupported` rather than reporting zero findings. No resolvable docs → `no_docs`.
2. **load** — read each markdown file at the pinned `ref`, capped at `maxFileBytes`. `markdown.ts` (pure) parses each document into addressable **spans** (heading sections, link nodes, fenced code blocks) with exact line/column ranges — the anchor substrate every later stage depends on.
3. **detect** *(Researcher)* — run the enabled detectors, each pure over already-fetched data: `ownership.ts` compares documented owners/Slack/PagerDuty references against the resolver's live facts; `deadLinks.ts` resolves relative doc links against the repo at `ref` and entity links against the catalog, classifying external URLs as `unverified`; `apiDrift.ts` compares documented symbols in code fences against the upstream interface reachable via `getRelations`. Produces `JanitorDiscrepancy[]` with `disc-N` IDs and source ranges.
4. **resolve** — `resolve.ts` attempts a **confidence-gated** replacement per discrepancy: the live catalog value for ownership drift (high confidence, deterministic), a catalog entity or indexed doc for a dead internal link (only above `minReplacementConfidence`), and no automatic replacement for API drift in v1. A discrepancy without a confident replacement stays a `recommendation` and generates **no patch** — the honest outcome when the fix needs human judgment.
5. **patch** *(Writer)* — for each resolvable discrepancy, one model call rewrites **only the delimited span**, and `patch.ts` (pure) builds an anchored unified diff whose changed hunks must fall entirely within the recorded range. A diff touching any other line is rejected as invalid.
6. **validate** *(the conditional edge)* — `validate.ts` (pure) checks the patched document: markdown well-formedness (balanced fences, intact link syntax, unchanged heading hierarchy), that the patch applies cleanly to the file read at `ref`, and that no new dead internal link was introduced. On failure with rounds remaining, `repair.ts` compiles a minimal instruction set and loops back to **patch** — the foundation doc's writer↔validation cycle — bounded by `maxRepairRounds` and **monotonic** (a round that fails to reduce blocking findings aborts). Emits `janitor-report` plus `documentation-patch` artifacts.
7. **gate** — when `deliver` is requested, a valid patch set exists, the configured delivery tool is registered, and `deliver.mode` is not `none`, emit `approval_request` carrying every file path, diff, and patch hash, checkpoint, and **suspend**. Report-only runs finish at the artifacts.
8. **deliver** *(resume path)* — `resume(runId, decision, context)`: on `approved`, re-validate each frozen patch against the current head (a doc edited since the gate aborts **that patch**, not the run), then open a PR via `vcs.pull_request.create` **or** file a patch-carrying ticket via `project.ticket.create` per `deliver.mode`; emit a `janitor-delivery-record` artifact plus audit entry and finish `delivered`/`partially_delivered`; on `rejected`, record the decision and finish `report_only`.

### State and output schema

The foundation doc's `JanitorDiscrepancy` / `DocumentationPatch` / `JanitorState` shapes are adopted, extended with the source ranges and citations this plan requires. The LangGraph `StateGraphArgs` channel reducers are **not** implemented — `JanitorState` is plain `WorkflowRunner` state.

```ts
type EvidenceRef = { id: string; source: 'doc' | 'catalog' | 'upstream' | 'knowledge'; summary: string; reference?: string };

type SourceRange = {             // the anchor every patch is bound to
  path: string;
  startLine: number;
  endLine: number;
  excerpt: string;               // exact original text, redacted
};

type JanitorDiscrepancy = {
  id: string;                    // 'disc-1' ...
  type: 'architectural_drift' | 'dead_link' | 'stale_ownership';  // 'telemetry_gap' deferred
  severity: 'low' | 'medium' | 'high';
  location: SourceRange;
  description: string;           // why this is a discrepancy, deterministic
  observed: string;              // what the doc says
  expected?: string;             // live value, when one was resolved
  linkStatus?: 'internal_dead' | 'entity_missing' | 'unverified_external';
  evidence: string[];            // cat-N / upstream-N / kb-N
};

type ReplacementProposal = {
  discrepancyId: string;
  replacement: string;           // the resolved value; never model-invented
  confidence: 'high' | 'medium' | 'low';
  basis: 'catalog_owner' | 'catalog_entity' | 'indexed_doc' | 'none';
  evidence: string[];
};

type DocumentationPatch = {
  filePath: string;
  ref: string;                   // the pinned ref the diff applies to
  range: SourceRange;
  originalContent: string;       // the span before modification
  patchedContent: string;        // the span after modification
  diff: string;                  // anchored unified diff, validated to apply
  patchHash: string;             // frozen at the gate, re-checked on resume
  explanation: string;           // model prose for the PR/ticket body
  repairRounds: number;          // validation cycles consumed
};

// JanitorState: { request, entity, ref, documents, discrepancies: JanitorDiscrepancy[],
//   proposals: ReplacementProposal[], patches: DocumentationPatch[],
//   validationLogs: string[], limitations: string[],
//   status: 'report_only'|'awaiting_approval'|'delivered'|'partially_delivered'
//         |'clean'|'no_docs'|'discovery_unsupported'|'validation_failed'|'partial' }

type JanitorReport = {
  entityRef: string;
  ref: string;
  documentsScanned: { path: string; bytes: number }[];
  discrepancies: JanitorDiscrepancy[];
  recommendations: JanitorDiscrepancy[];   // no confident replacement; human decision
  patches: DocumentationPatch[];
  counts: { patched: number; recommendations: number; unverifiedLinks: number };
  status: JanitorState['status'];
  limitations: string[];         // e.g. 'external links unverified', 'no vcs write tool'
  evidence: EvidenceRef[];
};

type JanitorDeliveryRecord = {
  reportRef: string;
  approvedBy: string;
  mode: 'pull_request' | 'ticket';
  delivered: { filePath: string; patchHash: string; reference: string }[];  // PR/ticket URL
  skipped: { filePath: string; reason: string }[];   // e.g. 'doc changed since gate'
  failures: { filePath: string; reason: string }[];
  outcome: 'delivered' | 'partially_delivered';
};
```

Status mapping is fixed in code, not inferred: no docs resolvable → `no_docs`; search unavailable with no explicit paths → `discovery_unsupported`; zero discrepancies → `clean`; discrepancies with delivery disabled or all recommendations → `report_only`; repair rounds exhausted with blocking findings → `validation_failed`; any detector unavailable → `partial` with the detector named; approved and all patches delivered → `delivered`; approved with any skip/failure → `partially_delivered`.

## Deterministic Detection (New Structural Section)

The foundation doc frames detection as LLM reasoning; making it arithmetic is what turns this from a plausible-sounding rewriter into a reviewable tool.

- `detectors/*` are pure modules: `(spans, liveFacts, upstream) => JanitorDiscrepancy[]`. No AI Core, tool, or clock dependency, so every rule is unit-testable against fixture markdown.
- **Ownership drift is a string comparison, not a judgment.** The catalog's `spec.owner` and Slack/PagerDuty annotations are authoritative; a documented owner that differs is a discrepancy with a deterministic `expected` value. This makes Feature 4 both the easiest and the highest-confidence patch class.
- **Dead-link classification is tiered by verifiability.** A relative doc link is dead if the target file is unreadable at the pinned `ref`; an entity link is dead if the entity does not resolve. Both are provable. An external URL is **`unverified_external`** — the plugin does not probe arbitrary hosts from the backend, and calling a third-party URL broken from one failed request would produce false positives on flaky or geo-fenced endpoints.
- **API drift is detected, not fixed.** `apiDrift.ts` reports documented symbols absent from the upstream interface, but v1 proposes no replacement: inferring a correct new call signature from an interface file is exactly where a model fabricates plausible-but-wrong code. It becomes a `recommendation` with the upstream evidence attached.
- Severity is a config-declared table keyed on discrepancy type, so an architect can see why a stale on-call channel outranks a broken tutorial link.
- The model's role is narrow by construction: it receives a delimited span plus a **pre-resolved** replacement value and rewrites the prose around it. It never chooses the replacement.

## Anchored Patching And The Validation Loop (New Structural Section)

Editing someone's documentation is a write into human-authored prose, so the blast radius is bounded structurally.

- **Every patch is anchored to a `SourceRange` captured at a pinned `ref`.** `patch.ts` rejects any diff whose changed hunks fall outside that range, so a model cannot quietly reformat a neighbouring section, reorder headings, or delete content it considered redundant.
- Pinning `ref` for the whole run is what makes anchors trustworthy: line numbers captured in **load** remain valid through **validate**, and drift is detected explicitly at resume rather than silently mis-applying.
- `validate.ts` is pure and layered, short-circuiting per layer: markdown well-formedness → patch applies cleanly → no new dead internal link. Ordering matters because an unparseable document is not worth link-checking.
- The **repair loop is bounded and monotonic**: at most `maxRepairRounds` (default 2), and a round that fails to reduce blocking findings aborts immediately rather than burning the remaining budget. Exhaustion is a first-class `validation_failed` outcome with the residual findings — never a partial write.
- `repair.ts` compiles a *minimal* instruction set (the failing rule, the offending line, the verbatim validator message) so the correcting call stays small and grounded, never a whole-document rewrite request.
- `repairRounds` is recorded per patch and reported, so a rising repair rate is visible as a model-quality signal rather than hidden cost.

## Staged Delivery Against A Missing Write Tool (New Structural Section)

`vcs.pull_request.create` does not exist, so the plan makes delivery a configurable mode rather than a blocked milestone.

- **`deliver.mode`** has three values: `none` (report-only — the default), `ticket` (file a patch-carrying ticket via the existing `project.ticket.create`), and `pull_request` (available once the write tool lands). Detection and patch generation are identical in all three; only the final hop differs.
- The `ticket` mode is a genuine bridge, not a placeholder: a ticket containing an anchored diff plus explanation is directly actionable by the owning team, and it exercises the same approval gate, idempotency, and audit path the PR mode will use.
- Selecting `pull_request` while the tool is unregistered is a **boot-time configuration error**, not a silent downgrade — an operator who asked for PRs should learn immediately rather than discover months of tickets.
- Delivery is **per-patch and partially-failable**: each file is delivered independently with success/skip/failure recorded. There is no batch op for either mode, and no rollback is attempted since neither tool exposes a delete.
- **Idempotency by `(filePath, patchHash)`**: a repeated approved resume re-reads the prior `JanitorDeliveryRecord` and skips completed files, so double-clicking approve cannot open two PRs or file two tickets for the same fix.
- Re-validation at resume is what makes the gate safe over time: if the document changed after approval, that patch is **skipped with a reason** rather than force-applied over someone else's edit.

## Deferred: Telemetry-Driven Gaps (New Structural Section)

Feature 3 is the foundation doc's most novel idea and the one with no data source, so the seam is documented rather than approximated.

- **What is missing**: no `search.*` tools, no `techdocs.*` tools, and no telemetry driver carrying search queries, result counts, or bounce rates. The only telemetry contract in core is `ObservabilityDriver`, which serves service metrics/logs/traces — a different domain entirely.
- **Why not approximate it**: a `knowledge.retrieve` miss means the *index* lacks a match, which is not the same as developers repeatedly searching for something. Deriving "developers keep asking about mTLS rotation" from retrieval misses would manufacture demand evidence, and the resulting doc-gap tickets would be unfalsifiable.
- **What landing it needs**: a search-analytics read contract (top queries, zero-result rate, bounce rate over a `TimeRange`) exposed as a `search.analytics.*` tool. That belongs in a shared integration module, not this plugin.
- **How v1 stays ready**: `JanitorRequest.reason` is a discriminated union with `telemetry_gap` reserved, and the foundation doc's `telemetry_gap` member is preserved in the documented `JanitorDiscrepancy` shape. Adding the detector is then additive — one pure module in `detectors/` plus one tool ID — with no change to patching, validation, or delivery.

## Vector Store Integration

- **No new vector infrastructure and no new indexing.** `knowledge.retrieve` reads the existing TechDocs/ADR corpus owned by `plugin-ai-core-backend-module-retrieval-augmenter`; run/checkpoint state lives in `plugin-ai-core-backend-module-runtime-store`.
- Retrieval has exactly **one** role: proposing a replacement target for a dead internal link, and only above `minReplacementConfidence`. It is structurally barred from the detectors, which receive spans, live catalog facts, and upstream interfaces — never retrieval output. Tests assert the discrepancy set is byte-identical with retrieval on and off.
- **Do not index patches or discrepancies.** They are point-in-time facts about mutable documents; embedding them would create a stale "this doc is wrong" store that outlives the fix and could feed itself on a later run.

## Background Scheduler Tasks (Optional Docs Sweep)

- `scheduler/docsSweep.ts` registers one optional `coreServices.scheduler` task: `id: 'techdocs-janitor-docs-sweep'`, `frequency: { cron }` from config (default `0 3 * * 1`), bounded `timeout`, non-zero `initialDelay`, `scope: 'global'`.
- `sweepPlanner.ts` (pure) selects components with a `techdocsRef`, caps them at `maxSweepComponents`, and skips any whose docs were audited within `sweep.cooldownDays` — a doc tree that has not changed does not need re-auditing weekly.
- The task POSTs one run per component to `/agents/techdocs-ai-janitor/runs` via `auth.getPluginRequestToken` + `discovery.getBaseUrl('ai-core')` with `source: 'scheduler'`, `reason: 'audit'`, `deliver: true`. It never executes the graph in-process.
- **Scheduled sweeps stop at the approval gate and never deliver autonomously** — the service principal holds no approval authority, so an unapproved patch set expires as a pending artifact. Without this, a weekly cron across a large estate would become a PR firehose.
- Guardrails: global mutex, per-sweep component cap, sequential dispatch with delay, per-component cooldown, and kill switch `sweep.enabled` (default **false**).

## Configuration

```yaml
ai:
  agents:
    techDocsJanitor:
      model: techdocs-janitor       # installation-registered model ID, required
      maxFiles: 20                  # optional, default 20 docs per run
      maxFileBytes: 65536           # optional, default 65536 per file
      maxDiscrepancies: 50          # optional, default 50
      maxToolInvocations: 40        # optional, default 40
      maxRepairRounds: 2            # optional, default 2 validation cycles
      runTimeoutSeconds: 300        # optional, default 300 wall-clock budget
      docs:
        paths: ['docs/**/*.md', 'README.md']   # optional discovery globs
        ignore: ['docs/generated/**']           # optional exclusions
      detectors:
        ownership: true             # optional, default true (Feature 4)
        deadLinks: true             # optional, default true (Feature 2)
        apiDrift: false             # optional, default false (Feature 1, report-only)
      links:
        verifyExternal: false       # optional, default false; no arbitrary host probes
        internalRoots: ['docs/']    # optional relative-link resolution roots
      resolution:
        minReplacementConfidence: medium  # optional; below this -> recommendation only
      severity:                     # optional discrepancy type -> severity
        stale_ownership: high
        dead_link: medium
        architectural_drift: medium
      deliver:
        mode: none                  # 'none' | 'ticket' | 'pull_request'; default none
        branchPrefix: docs-janitor  # optional, for pull_request mode
        ticketLabels: ['docs', 'janitor-generated']   # optional, for ticket mode
      sweep:
        enabled: false              # optional, default false
        cron: '0 3 * * 1'           # optional, default Monday 03:00
        maxSweepComponents: 30      # optional, default 30
        cooldownDays: 14            # optional, default 14 per-component re-audit gap
```

`config.ts` mirrors `readCatalogAiInsightsConfig`: throw when the section or `model` is absent; document every default in `config.d.ts`. Validate at boot that `deliver.mode: 'pull_request'` has its tool registered (otherwise **fail startup** rather than silently degrading), that `deliver.mode: 'ticket'` has a project-management driver, and that every `severity` key is a known discrepancy type.

## Shared AI-Core Work To Build First

- **Nothing blocks detection.** Doc resolution (`CatalogEntityResolver` incl. `techdocsRef`), markdown reads, dependency traversal, retrieval, checkpoints, and `resume()` all exist today, so Features 4 and 2 plus report-only Feature 1 are buildable immediately.
- **Blocking for PR delivery — `vcs.pull_request.create`.** Add `createPullRequest(repoUrl, { baseBranch, headBranch, title, body, files })` to `VcsDriver` and register the tool with `effect: 'write'`. **Now needed by four plugins** (`alert-ai-tuner`, `scaffolder-ai-drift-detector`, `scaffolder-ai-prd`, and this one) — build it once in `plugin-ai-core-backend-module-vcs`. Until then `deliver.mode: 'ticket'` is a working substitute.
- **Deferred — a search-analytics contract** for Feature 3 (see Deferred section). Belongs in a shared integration module; do not build a bespoke telemetry reader here.
- **Optional — extend VCS search coverage.** Real `searchRepository` for Bitbucket/Gerrit removes the `discovery_unsupported` path and lets the sweep find docs without explicit paths. Shared with `search-ai-context`, `tech-debt-ai-scout`, and `tech-radar-ai-manager`.
- **No new detection, patching, or scheduling machinery** — `markdown.ts`, `detectors/*`, `patch.ts`, `validate.ts`, `repair.ts`, and `sweepPlanner.ts` are plugin-local pure modules; approval types, `resume()`, checkpoints, audit, and the scheduler are consumed as-is.

## Frontend Plan

Mirror the `catalog-ai-insights` frontend layout and wiring exactly: `alpha.ts` composing extensions into a `createFrontendPlugin` `FrontendFeature`, `extensions/api.ts` using `ApiBlueprint.make({ params: defineParams => defineParams(createApiFactory({...})) })`, `extensions/components.ts` using `PageBlueprint.make({ name, params: { path, title, routeRef, loader } })` plus `EntityCardBlueprint.make(...)`, self-contained wire types in `@types/`, and an SSE client over `discoveryApi.getBaseUrl('ai-core')` with `eventsource-parser` and `Last-Event-ID` replay. Every directory carries a barrel `index.ts`. The package directory exists but is **empty** — scaffold it from scratch.

```text
plugins/frontend/plugin-ai-agent-frontend-techdocs-ai-janitor/
  src/
    index.ts                      # barrel: public components/api/types
    alpha.ts                      # createFrontendPlugin: pluginId + extensions
    plugin.ts                     # legacy-system plugin + routable extension
    routes.ts                     # ROOT_PATH + rootRouteRef
    @types/
      index.ts                    # JanitorRequest/Report/Patch/DeliveryRecord wire types
    api/
      index.ts                    # barrel
      apiRef.ts                   # techDocsJanitorApiRef
      client.ts                   # TechDocsJanitorClient: scanDocs(), streamRunEvents(), submitApproval(), listReports()
    hooks/
      index.ts                    # barrel
      useJanitorRun.ts            # pure reducer + hook (scan/approve/reject/reset)
      useJanitorQueue.ts          # cross-component findings queue
    components/
      index.ts                    # barrel
      JanitorQueuePage.tsx        # standalone: findings queue + on-demand scan
      RunScanDialog.tsx           # entityRef/paths/detectors/deliver inputs
      JanitorRunView.tsx          # live per-stage progress from SSE
      DiscrepancyTable.tsx        # type, severity, file:line, observed vs expected
      PatchDiffPreview.tsx        # anchored unified diff per file, syntax-highlighted
      RecommendationList.tsx      # findings with no confident replacement
      LinkStatusBadge.tsx         # internal_dead / entity_missing / unverified_external
      RepairTimeline.tsx          # validation rounds and what each fixed
      DeliveryApprovalBar.tsx     # approve/reject the exact patch set
      DeliveryOutcomePanel.tsx    # delivered / skipped / failed per file
      EntityDocsHealthCard.tsx    # entity-page card: this component's doc health
    extensions/
      api.ts                      # ApiBlueprint.make(...)
      components.ts               # PageBlueprint.make(...) + EntityCardBlueprint.make(...)
    __tests__/
```

Frontend deltas vs `catalog-ai-insights`:

- `backstage.pluginId: 'techdocs-ai-janitor'`; package `@ai-crew-suite/plugin-agent-techdocs-janitor`.
- Primary surface is a **standalone findings queue** via `PageBlueprint`, plus an **`EntityCardBlueprint`** doc-health card — apt here since discrepancies attach to a real catalog component.
- **`PatchDiffPreview` must show the anchored range**, not just the diff, so a reviewer can see the edit is confined to one span. This is the UI expression of the anchoring guarantee, and it is what makes approving a docs patch quick.
- **`RecommendationList` is as important as the patch list.** Findings with no confident replacement (API drift, ambiguous dead links) are where human judgment is required; burying them under auto-patchable items would hide the harder problems.
- `LinkStatusBadge` must render `unverified_external` **distinctly from** `internal_dead` — the first means "we did not check", the second means "provably broken". Conflating them would either alarm or falsely reassure.
- `RepairTimeline` makes the validation loop legible (round → findings fixed → residual), the main debugging aid when a patch repeatedly fails validation.
- `DeliveryOutcomePanel` renders `skipped` (e.g. *"doc changed since approval"*) as prominently as successes, so a `partially_delivered` outcome is never mistaken for complete.
- `clean`, `no_docs`, `discovery_unsupported`, and `validation_failed` render as first-class explained outcomes, not errors — and `discovery_unsupported` must explicitly say the docs tree was **not** searched.

## Test Strategy

Reuse the `catalog-ai-insights` test-layer table (unit/contract/backend integration/runtime integration/LLM evaluation/full-stack E2E) and its network policies. Deltas only:

- **Unit (the highest-value layer here)**: `markdown.ts` span extraction with exact line ranges across headings, links, and fenced blocks, including CRLF and nested-list edge cases. `detectors/ownership.ts` catalog-vs-document comparison (owner, Slack channel, PagerDuty ref) and the no-drift case. `detectors/deadLinks.ts` the full classification matrix — resolvable relative link, missing relative link, resolvable entity, missing entity, external URL → `unverified_external`. `detectors/apiDrift.ts` symbol comparison producing a recommendation with **no** patch. `patch.ts` anchoring: a diff confined to the range is accepted, one touching an adjacent line is rejected. `validate.ts` per-layer rules (unbalanced fence, broken link syntax, altered heading depth, new dead link). `repair.ts` minimal-instruction compilation and the monotonic abort.
- **Workflow (runtime) tests**: drive `JanitorGraph.run()` with a stubbed `WorkflowContext` (`invokeTool` mock router keyed by `toolId` + args) plus a fake `CatalogEntityResolver`. **Headline scenario**: a doc naming owner `team-alpha` and linking `../legacy-service/index.md` while the catalog says `spec.owner: team-beta` and the target file is gone. Assert two discrepancies with correct ranges, a high-confidence ownership patch, a dead-link finding, the run **suspends** at `approval_request`, and **no write tool was called**.
- **Anchoring-safety test** (the plugin's sharpest risk): script the model to return a rewrite that also reformats a neighbouring section; assert `patch.ts` rejects it, the run does not emit that patch, and the discrepancy degrades to a recommendation rather than silently applying a wide edit.
- **Validation-loop tests**: script an unbalanced code fence on round 1 and a valid patch on round 2; assert `repairRounds === 1` and the final patch validates. Then script a persistently invalid rewrite and assert `validation_failed` with `maxRepairRounds` consumed and **zero** patches emitted.
- **Confidence-gating tests**: a dead link with a high-confidence catalog match produces a patch; the same link with only a low-confidence retrieval hit produces a `recommendation` with no patch and no invented URL.
- **Discovery-safety test**: configure a stub-search provider with no explicit `paths`; assert `discovery_unsupported` with a limitation, and that the report does **not** read as `clean`.
- **Ref-pinning and resume tests**: assert the pinned `ref` is used for every read; then mutate a file between gate and resume and assert that patch is `skipped` with `doc changed since gate` while other patches still deliver.
- **Delivery-mode tests**: `mode: 'none'` emits artifacts and calls nothing; `mode: 'ticket'` files patch-carrying tickets via `project.ticket.create` exactly once per file; `mode: 'pull_request'` with the tool unregistered **fails at boot** rather than silently degrading; a repeated approved resume delivers nothing new (idempotent by `(filePath, patchHash)`).
- **Anti-fabrication tests**: a model rewrite introducing an owner, channel, URL, or API symbol absent from the supplied replacement is stripped and the patch rejected; assert no patch body contains a value without a `cat-N`/`kb-N` citation.
- **`knowledge.retrieve` isolation**: assert the discrepancy set is byte-identical with retrieval on and off, and that retrieval can only affect a *replacement*, never a detection.
- **Scheduler tests**: `mockServices.scheduler` fast-forwards the sweep tick; assert bounded authenticated dispatch, cooldown skipping, `sweep.enabled: false` respected, mutex behavior, and **no autonomous delivery**.
- **Backend integration**: `startTestBackend` with this module + AI Core + `mockServices.rootConfig` + `mockServices.database`, plus a stub resolver and fixture VCS/ticket tools, asserting boot registration, per-stage SSE ordering, checkpointing, resume flow, and report/patch/delivery artifact persistence.
- **E2E**: extend the shared fixture profile with a fixture docs tree containing a stale owner and a broken relative link, plus fixture catalog entities and a ticket driver. Playwright: open the queue → run a scan → inspect the diff and the anchored range → approve → assert the delivery outcome; plus a reject path and a recommendation-only path. Add `yarn test:e2e:techdocs-ai-janitor`.

## Security and Operational Guardrails

`catalog-ai-insights` guardrails apply unchanged (identity propagation, redaction before model/SSE/artifacts, tool/token/wall-clock caps, correlation IDs). Janitor-specific additions:

- **No source mutation without a persisted human approval**, and `deliver.mode` defaults to `none`. The decision, `approvedBy`, every file path, and every `patchHash` are audit-logged; rejections are audited too. Scheduled sweeps reach the gate but cannot satisfy it.
- **Edits are structurally confined to an anchored range.** A patch touching any line outside its `SourceRange` is rejected in code, so the agent cannot rewrite, reorder, or delete documentation it was not asked to touch — the core protection when writing into human-authored prose.
- **Never invent a replacement.** Owners, channels, URLs, entity refs, and API symbols come from the catalog, the repo, or the index; absent a confident source, the finding stays a recommendation. A fabricated Slack channel in an on-call document is worse than a stale one.
- **Never claim an unverified external link is broken.** `unverified_external` is distinct from `internal_dead` in state, artifact, and UI; the plugin does not probe arbitrary hosts from the backend.
- **Never report an unsearched docs tree as clean.** `discovery_unsupported` is a first-class outcome.
- Documentation content is **untrusted input**: cap `maxFileBytes`/`maxFiles`, scrub secret-shaped strings before content reaches the model, SSE, artifacts, or a ticket body, and delimit document text in the prompt with an instruction not to follow embedded directives — a markdown file reading "ignore previous instructions" is a realistic injection vector in a docs tree.
- Authorization is per-caller: catalog and repository reads propagate the requester's credentials; delivery uses the approver's, so repository and board permissions apply.
- Re-validation at resume prevents overwriting concurrent human edits; a changed document skips its patch rather than force-applying a stale diff.

## Ordered Implementation Milestones

### Milestone 0: Pure detectors and anchoring

- [ ] Confirm `CatalogEntityResolver` (incl. `techdocsRef`), `vcs.repository.read_file`/`search`/`get_metadata`, `project.ticket.create`, and `knowledge.retrieve` against the installed code; enumerate search-capable providers.
- [ ] Define `SourceRange`, `JanitorDiscrepancy`, `ReplacementProposal`, `DocumentationPatch`, `JanitorReport`, `JanitorDeliveryRecord`, and the config schema (adopting the foundation doc's type shapes, without LangGraph channels).
- [ ] Implement + unit-test `markdown.ts`, `detectors/ownership.ts`, `detectors/deadLinks.ts`, `detectors/apiDrift.ts`, `patch.ts` anchoring, `validate.ts`, and `repair.ts`.

Exit criteria: span extraction, the dead-link classification matrix, and anchoring rejection are provably deterministic on fixture markdown.

### Milestone 1: Detection backend (report-only)

- [ ] Scaffold the package with a barrel `index.ts` in every directory, register the runner/agent/manual trigger, config parsing; register in root `tsconfig.json` + `.eslintrc.cjs`.
- [ ] Implement scope → load → detect → resolve → patch → validate → `janitor-report` + `documentation-patch`, with `DocsTargetResolver` and `JanitorToolRunner` (including `discovery_unsupported`).
- [ ] Wire into `packages/backend` and add the `ai.agents.techDocsJanitor` config block.
- [ ] Add unit, workflow-scenario, anchoring-safety, validation-loop, confidence-gating, and backend integration tests.

Exit criteria: the stale-owner + broken-link fixture yields a correct anchored patch and a recommendation, with no real LLM and no writes.

### Milestone 2: Approval-gated ticket delivery

- [ ] Implement the gate + `JanitorGraph.resume()`: checkpointed patch set, `approval_request`, `deliver.mode: 'ticket'` via `project.ticket.create`, re-validation against head, `(filePath, patchHash)` idempotency, `janitor-delivery-record` artifact, and audit.
- [ ] Gate-hardening, delivery-mode, ref-pinning, and doc-changed-since-gate tests.

Exit criteria: patches are delivered only after approval, exactly once per file, and a concurrently-edited document is skipped rather than overwritten.

### Milestone 3: PR delivery (when the write tool lands)

- [ ] Add `vcs.pull_request.create` to the allow-list and implement `deliver.mode: 'pull_request'` with branch naming, boot-time validation that the tool is registered, and one PR per run (grouped patches).
- [ ] PR-path tests mirroring the ticket path, plus the fail-at-boot assertion for a misconfigured mode.

Exit criteria: an approved patch set opens exactly one PR containing all anchored diffs, and a missing tool fails startup rather than degrading silently.

### Milestone 4: Sweep, frontend, and E2E

- [ ] Implement `docsSweep` with mutex, caps, cooldown, and kill switch, plus fast-forwarded scheduler tests asserting no autonomous delivery.
- [ ] Scaffold the empty frontend package (`ApiBlueprint` + `PageBlueprint` + `EntityCardBlueprint`, queue, scan dialog, run view, discrepancy table, diff preview, recommendations, link badges, repair timeline, approval bar, outcome panel) with barrel indexes, and register it in `packages/app`.
- [ ] Component tests (loading, streaming, clean/no_docs/discovery_unsupported/validation_failed, all link statuses, awaiting approval, delivered, partially_delivered, replay) plus accessibility checks — including assertions that `unverified_external` is visually distinct from `internal_dead` and that the anchored range is shown with every diff.
- [ ] Extend the E2E fixture profile and add Playwright scan, approve, reject, and recommendation-only scenarios with screenshot review.

Exit criteria: `yarn test:e2e:techdocs-ai-janitor` demonstrates scan → anchored diff → approve → delivery, plus reject and recommendation paths, without external infrastructure.

### Milestone 5: Production readiness

- [ ] Document model registration, docs-path globs, detector enablement, delivery-mode selection (and the external-link `unverified` policy), sweep cadence, and approver permissions.
- [ ] Dashboards/alerts for discrepancies by type, **patch-to-recommendation ratio**, repair-round rate (model-quality signal), `discovery_unsupported` count, approval/rejection ratio, skipped-on-resume rate, and token cost per run.
- [ ] Opt-in real-model evaluation suite (grounding: every patch value cites catalog/repo/index evidence; no invented owners, channels, URLs, or symbols; edits confined to the anchored range) within budget.
- [ ] Follow-ups: `vcs.pull_request.create` (shared with three sibling plugins) and Bitbucket/Gerrit `searchRepository`.

Exit criteria: staged rollout with `deliver.mode: 'none'` by default, verified anchoring, and the external-link policy documented.

## Frontend Completed

### Standalone TechDocs audit UI

- Route: `/techdocs-ai-janitor`

- Agent: `techdocs-ai-janitor`

- Artifact: `janitor-report`

- Supports authenticated AI Core SSE for:

  - Starting an explicit-path documentation audit.
  - Replaying persisted audit runs through `?run=<id>`.

### Audit submission form

Requires:

- Catalog entity reference.
- HTTP(S) repository URL.
- Explicit markdown paths, one per line.

The UI intentionally requires explicit paths because document discovery is not active in the deployed backend.

### Report rendering

Displays:

- Audit progress.

- Report status and entity.

- Source-ranged discrepancies:

  - Severity.
  - Discrepancy type.
  - Source file and line range.
  - Original excerpt.
  - Catalog-backed replacement where one exists.

- Backend limitations.

- Catalog and markdown evidence citations.

### Honesty boundaries

The UI has no patch, ticket, PR, delivery, or approval controls. It explicitly represents the current backend's read-only behavior:

- No patch generation.
- No repair loop.
- No API drift analysis.
- No ticket creation.
- No documentation PRs.
- External links are reported as unverified where the backend cannot safely probe them.

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

- Janitor report reducer extraction and malformed JSON handling.
- Source-ranged discrepancy, limitation, and evidence citation rendering.
- App feature-list expectation for `techdocs-ai-janitor`.

## Backend Completed

## Delivered

### AI Core module

- Agent ID: `techdocs-ai-janitor`
- Workflow ID: `techdocs-janitor`
- Artifact kind: `janitor-report`
- Read-only tool allow-list:
  - `vcs.repository.read_file`

### Current deterministic audit behavior

- Requires an explicit, scoped request:

  - `entityRef`
  - repository URL
  - explicit markdown paths
  - optional pinned ref

- Resolves the live catalog entity ownership through a package-local catalog resolver.

- Reads bounded markdown documents through `vcs.repository.read_file`.

- Detects:

  - Documented owner/team values that differ from the live catalog owner.
  - Relative links requiring internal target verification.
  - External links marked as `unverified_external` without probing arbitrary hosts.

- Produces cited discrepancies with exact source line ranges and excerpts.

- Emits replayable `janitor-report` artifacts.

- Separates partial file-read failure from clean documentation.

### Explicitly inactive

The implementation correctly does not advertise or invoke:

- Patch generation or anchored diff artifacts.
- Repair/validation loops.
- API-drift analysis.
- Catalog entity-link resolution.
- Ticket delivery.
- Documentation PR creation or any VCS write.

The README describes these limits clearly.

## Registration

Wired into:

- `/home/kevin/Repos/backstage/ai-crew-suite/tsconfig.json`
- `/home/kevin/Repos/backstage/ai-crew-suite/.eslintrc.cjs`
- `/home/kevin/Repos/backstage/ai-crew-suite/packages/backend/package.json`
- `/home/kevin/Repos/backstage/ai-crew-suite/packages/backend/src/index.ts`
- `/home/kevin/Repos/backstage/ai-crew-suite/app-config.yaml`
- `/home/kevin/Repos/backstage/ai-crew-suite/yarn.lock`

Configuration added:

```yaml
ai:
  agents:
    techdocsJanitor:
      model: techdocs-janitor
```

## Tests

Added focused coverage for:

- Owner drift detection.
- Relative and external link classification.
- Exact source-range retention.
- Graph artifact output for owner/link discrepancies.
- Confirmation that only `vcs.repository.read_file` is called.

## Definition of Done

- Package, agent, runner (`run` + `resume`), triggers (manual + sweep), config schema, and the allow-list implemented and registered (root + backend/app wiring included), with a barrel `index.ts` in every directory.
- Runs execute through the real AI Core controller/runtime with persisted replayable events, checkpoints at the gate, and `janitor-report` / `documentation-patch` / `janitor-delivery-record` artifacts.
- Detection, source-range anchoring, patch application, and markdown validation are pure deterministic code — never model output — and the model rewrites only a delimited span using a pre-resolved replacement.
- Every patch is confined to its `SourceRange` at a pinned `ref`; a diff touching any other line is rejected, and a document changed since approval is skipped rather than overwritten.
- Findings without a confident replacement remain recommendations with no patch; no owner, channel, URL, entity ref, or API symbol is ever invented.
- `unverified_external` is never presented as broken, and `discovery_unsupported` is never presented as clean.
- The validation loop provably recovers a malformed rewrite within `maxRepairRounds` and terminates as `validation_failed` with zero patches when it cannot.
- No file is written and no PR/ticket created without a persisted approval; delivery is idempotent per `(filePath, patchHash)`, uses the approver's credentials, and reports partial outcomes precisely.
- Frontend renders discrepancies, anchored diffs, recommendations, repair rounds, and approval over live SSE and replay via `ApiBlueprint`/`PageBlueprint`; Playwright verifies scan, approve, reject, and recommendation paths on fixtures.
- No output surface (SSE, artifacts, logs, audit, tests, tickets) contains secrets, unbounded document bodies, uncited replacement values, or an edit outside an anchored range.
