# Release Notes AI Generator Implementation Plan

## Overview

This plugin analyzes branch diffs, commit histories, and pull request bodies to automatically generate release notes tailored for product teams and stakeholders.

- **The Task:** Generating customer-facing release notes from merged PRs.
- **The Logic:** An agent aggregates all merged PRs since the last tag and generates customer-facing release notes.

## Goal

Implement `@ai-crew-suite/plugin-agent-release-notes-generator-backend` as an AI Core backend module that turns "all merged PRs since the last release tag" into **customer-facing release notes**. It gathers the PR delta for a repository/window, categorizes changes against a configurable taxonomy, filters out internal chores, resolves cryptic PR titles into readable feature descriptions via linked tickets, summarizes per category with an LLM, and — only after **explicit human approval** — publishes the notes. A paired frontend plugin drives generation, shows the draft, and provides the approve/reject gate.

Reuse the architecture proven by `plugin-ai-agent-backend-catalog-ai-insights` (its `_IMPLEMENTATION.md` is the source of truth for repository conventions, workflow-runner mechanics, event contracts, monorepo wiring, and test-layer definitions). This plan documents only what differs: the **gather → categorize → summarize → publish** flow, taxonomy-driven categorization, and — the first in this plugin series — a **human-in-the-loop approval gate guarding a write action**.

## Delivery Boundary

### In scope

- Generate a categorized release-notes **draft** for one repository and version window per run, via `/agents/release-notes-ai-generator/runs`.
- Deterministic gather → categorize → summarize graph, then an **approval gate** before any publish.
- Bounded collection over merged PRs and linked tickets through registered read-only AI Core tools.
- Deterministic categorization (`feature` / `fix` / `improvement` / `breaking` / `internal`) with internal-chore filtering; the model only rewrites copy, it does not decide inclusion.
- Optional RAG via `knowledge.retrieve` for prior release-note style/context.
- A structured, citation-required `ReleaseNotesDraft` artifact, an `approval_request` event, and — on approve — a `ReleaseNotesPublication` artifact.
- Optional scheduled draft generation (e.g. Fridays 17:00) that stops at the draft/approval gate; scheduled runs never auto-publish.
- A minimal frontend: generate action, live SSE run view, categorized draft editor/preview, and the approve/reject control.

### Explicitly out of scope for v1

- **Autonomous publishing.** Publish only executes after a human `approved` decision; scheduled runs pause at the gate.
- Mutating source repositories beyond the single publish action (no branch pushes, no doc commits in v1 — see the write-tool gate below).
- Rewriting git history, editing tags other than the target release tag, or deleting releases.
- Cross-repository / monorepo-wide aggregated notes; one repo + window per run.

## Required Prerequisites

Contracts verified against the current codebase. As with the catalog plan: no fictional service refs — the foundation doc's `github.service` / `jira.service` `createServiceFactory` sketches (including `getMergedPrsSinceLastTag` / `publishReleaseNotes`) must not be implemented; use the registered tool IDs through the workflow context.

**Hard gate — write/publish capability does not exist yet.** This is the first write-capable workflow in the plugin series, and the required contracts are missing today.

| Capability | Required contract | Current state | Required action |
| --- | --- | --- | --- |
| List merged PRs in window | `vcs.pull_request.list` | Exists, `effect: read`; `VcsDriver.listPullRequests(repoUrl)` returns `PullRequestSummary[]` | Filter by merge time to the version window; the driver currently lists PRs without a tag/window arg — add a bounded window filter in the collector, or extend the driver signature generically. |
| Resolve last/target tag & PR delta | `vcs.repository.get_release_tags`, `vcs.repository.compare` (**new**) | **Not present** — `VcsDriver` has `getRepositoryMetadata`, `readFile`, `searchRepository`, `listPullRequests` only; no tag/compare/diff ops | Add read-only tag/compare ops to `VcsDriver` + `vcs.*` tools in `plugin-ai-core-backend-module-vcs`, or derive the window from PR merge timestamps in v1 and defer true tag-delta to when the contract lands. |
| Ticket enrichment | `project.ticket.get`, `project.ticket.search` | Exist, `effect: read` (project-management module, Jira driver) | Resolve ticket keys parsed from PR bodies/titles; degrade when no driver is configured. |
| Prior-notes style/context | `knowledge.retrieve` + `DefaultRetrievalPipeline` | Exists | Optional; retrieve prior release notes for tone. Not the primary data path. |
| **Publish release notes (write)** | `vcs.release.publish` (**new, `effect: 'write'`**) | **Not present** — no write-capable VCS tool exists anywhere; all `vcs.*` tools are `effect: read` | Add a `publishRelease(repoUrl, tag, body)` op to `VcsDriver` and a `vcs.release.publish` tool declared `effect: 'write'`, so AI Core's approval policy pauses the run before it runs. **Blocking for the publish milestone.** |
| Human approval gate | `ApprovalRequest` / `ApprovalDecision`, `WorkflowRunner.resume()`, `AuditLogSink` | **Exist** — approval types, `resume(runId, decision, context)`, `approval_request`/`approval_response` events, and audit sink are all defined | Implement `HandoverGraph.resume()`-style resume; emit `approval_request` before the write; record the decision to the audit sink. |
| Stateful runs, SSE, checkpoints | AI Core run controller + `workflowRunnerExtensionPoint` + runtime stores | Exist | Register runner `release-notes`; checkpoint before the gate so approve/reject resumes deterministically. |
| Scheduled draft runs | `coreServices.scheduler` + `discovery` + `auth` | Available | Schedule in-module; dispatch authenticated POSTs; scheduled runs stop at the draft gate. |

## Package Shape

Backend module from the same template as catalog-ai-insights; only the domain directories differ:

```text
plugins/backend/plugin-ai-agent-backend-release-notes-ai-generator/
  package.json          # role: backend-plugin-module, pluginId: ai-core
  tsconfig.json
  config.d.ts
  README.md
  src/
    index.ts
    module.ts           # registers runner, agent, triggers, scheduler task
    agent.ts            # RELEASE_NOTES_AGENT_ID, tool allow-list, system prompt
    config.ts           # readReleaseNotesConfig (ai.agents.releaseNotes)
    workflow/
      ReleaseNotesGraph.ts      # WorkflowRunner id 'release-notes' (run + resume)
      state.ts                  # ReleaseNotesState (accumulates PRs/tickets/categories)
      window.ts                 # tag/window resolution + bounds validation
      collectors.ts             # merged-PR + ticket collection -> ChangeItem[]
      categorize.ts             # deterministic taxonomy classification + chore filter
      draft.ts                  # ReleaseNotesDraft schema, validation, degradation
      publish.ts                # approval-gated publish step (vcs.release.publish)
    retrieval/
      PriorNotesRetriever.ts    # knowledge.retrieve wrapper for prior-notes style
      promptContext.ts          # categorized changes -> per-category summarizer prompt
    scheduler/
      cadence.ts                # coreServices.scheduler registration (e.g. weekly)
      cadencePlanner.ts         # pure: cadence config -> draft dispatch plan
    services/
      ReleaseToolRunner.ts      # capped invokeTool facade (mirrors InsightToolRunner)
      ReleaseArtifactWriter.ts  # draft + publication artifacts
    __tests__/
    workflow/__tests__/
    retrieval/__tests__/
    scheduler/__tests__/
    services/__tests__/
```

- `createBackendModule` with `pluginId: 'ai-core'`, `moduleId: 'agent-release-notes-ai-generator'`.
- `module.ts` deps: `coreServices.rootConfig`, `logger`, `scheduler`, `discovery`, `auth`, plus `agentExtensionPoint`, `triggerExtensionPoint`, `workflowRunnerExtensionPoint`. No `catalogServiceRef` (repo scope comes from the request payload, not entity resolution).
- Package naming, scripts, Apache header, root `tsconfig.json` references, and `.eslintrc.cjs` role overrides follow catalog-ai-insights and `plugin-registration.md` verbatim (not repeated here).

## Monorepo And App Wiring

Same delegated-but-verified steps as catalog-ai-insights (see that plan's "Monorepo And App Wiring"). Deltas:

- **Backend load**: add `"@ai-crew-suite/plugin-agent-release-notes-generator-backend": "workspace:^"` to `packages/backend/package.json` and `backend.add(loadBackendFeature(import('@ai-crew-suite/plugin-agent-release-notes-generator-backend')))` in `packages/backend/src/index.ts`, grouped with the other `@webstackbuilders` module loads.
- **VCS module gate**: because publish requires the new `vcs.release.publish` write tool (see Prerequisites), the VCS module (`plugin-ai-core-backend-module-vcs`) must be extended and loaded before the publish milestone is enabled. Draft-only runs work without it.
- **App config**: the module throws at boot without `ai.agents.releaseNotes.model`; add the config block (see Configuration) before enabling the load. Publishing additionally requires `ai.agents.releaseNotes.publish.enabled: true`.
- **Frontend registration**: add `"@ai-crew-suite/plugin-agent-release-notes-generator": "workspace:^"` to `packages/app/package.json`, import its `/alpha` default export in `packages/app/src/App.tsx`, and extend plugin-ID expectations in `packages/app/src/App.test.tsx` — copy the `catalog-ai-insights` wiring.
- **Yarn PnP refresh**: `yarn install` after dependency edits, then `yarn typecheck --force` / `yarn lint --force`.

## Agent Definition

```ts
{
  id: 'release-notes-ai-generator',
  modelRef: config.modelRef,          // installation-registered ID, e.g. 'release-notes'
  workflowRef: 'release-notes',
  memory: 'none',                     // each release window is self-contained
  systemPrompt: RELEASE_NOTES_SYSTEM_PROMPT,
  toolIds: [
    'vcs.pull_request.list',
    'vcs.repository.get_metadata',
    'project.ticket.get',
    'project.ticket.search',
    'knowledge.retrieve',
    'vcs.release.publish',            // effect: 'write' — NEW; only invoked post-approval
  ],
  triggers: [
    { id: 'release-notes-on-demand', source: 'manual', agentId: 'release-notes-ai-generator' },
    { id: 'release-notes-cadence', source: 'scheduler', agentId: 'release-notes-ai-generator' },
  ],
}
```

- Read tools (`vcs.*` read, `project.*` read, `knowledge.retrieve`) run freely. The single write tool `vcs.release.publish` is `effect: 'write'`, so AI Core's approval policy pauses the run and emits `approval_request` before it executes — the plugin must not bypass this.
- Until `vcs.release.publish` lands, omit it from the allow-list; the workflow terminates at the draft artifact and the approval gate is a no-op success. Do not fake publication.
- System prompt rules: rewrite categorized changes into customer-facing copy only; never re-classify or add changes not in the supplied bundle; cite `chg-N` IDs for every note line; use ticket summaries to clarify cryptic titles; never invent version numbers, dates, or PR authors.

## Run Input Contract

The generic `AgentRunInput.input.query` carries a versioned JSON payload:

```ts
type ReleaseNotesRequest = {
  version: 1;
  source: 'manual' | 'scheduler';
  repoUrl: string;              // required: canonical repo URL/slug
  fromRef?: string;            // last release tag; if omitted, derived from PR merge window
  toRef?: string;              // target ref/tag; defaults to default branch HEAD
  targetTag?: string;          // tag to publish under (required only to publish)
  windowDays?: number;         // fallback window when fromRef is absent; capped
  taxonomy?: CategoryTaxonomy; // optional override of the default category map
  autoPublish?: false;         // reserved; always treated as false in v1
};
```

Validation requires `repoUrl`, clamps `windowDays` to `maxWindowDays`, rejects unknown versions, and forces `autoPublish` to `false` (publish always requires the approval gate).

## Release Notes Workflow

`ReleaseNotesGraph` registers as `WorkflowRunner` id `release-notes` and implements **both** `run()` and `resume()`. It realizes the foundation doc's **gather → categorize → summarize → publish** flow, checkpointing before the approval gate so an approve/reject decision resumes deterministically.

### Deterministic graph nodes

1. **window.resolve** — validate `ReleaseNotesRequest`; resolve `[fromRef, toRef]` (or derive the window from PR merge timestamps when `fromRef` is absent) via `window.ts`; fetch repo metadata. Invalid input → terminal `error`, no model call.
2. **gather.changes** — `vcs.pull_request.list` (merged within window) through `ReleaseToolRunner`; parse ticket keys (`JIRA-\d+`, `#\d+`) from PR titles/bodies. Each PR becomes a `ChangeItem` with a stable `chg-N` ID.
3. **enrich.tickets** — for parsed keys, `project.ticket.get` (batch-capped) to attach human-readable summaries; missing driver → limitation, unresolved keys keep raw titles.
4. **categorize.filter** — **deterministic** taxonomy classification (`categorize.ts`): map each `ChangeItem` to `feature | fix | improvement | breaking | internal` from conventional-commit prefixes + taxonomy rules; drop `internal` (chores) from the customer-facing set but retain them in state for audit. **The model never decides inclusion** — this satisfies the foundation doc's "isolate `chore: fix typo` from features" requirement testably.
5. **context.enrich** *(optional)* — `PriorNotesRetriever` calls `knowledge.retrieve` for prior release notes to guide tone; capped, attached as style context only.
6. **draft.summarize** — one model call per category (or one structured call) producing customer-facing copy; every line cites `chg-N` IDs. Invalid/uncited output degrades to deterministic titles. Emits the `release-notes-draft` artifact.
7. **approval.gate** — if publishing is requested and `vcs.release.publish` is available, emit an `approval_request` (`effect: 'write'`), persist a checkpoint, and **suspend**. Scheduled runs and draft-only runs skip the gate and finish at the draft artifact.
8. **publish** *(resume path)* — `resume(runId, decision, context)`: on `approved`, invoke `vcs.release.publish` via `ReleaseToolRunner`, emit the `release-notes-publication` artifact + audit entry, then `done`; on `rejected`, record the decision and finish without publishing.

### State, taxonomy, and output schema

```ts
type ChangeItem = {
  id: string;                     // 'chg-1' ...
  prNumber?: number;
  title: string;
  author?: string;
  mergedAt?: string;
  tickets: { key: string; summary?: string }[];
  category: 'feature' | 'fix' | 'improvement' | 'breaking' | 'internal';
  reference?: string;             // PR/deep link
};

type CategoryTaxonomy = Record<string, ChangeItem['category']>; // prefix -> category

// ReleaseNotesState: { request, window, changes: ChangeItem[],
//   included: ChangeItem[], filtered: ChangeItem[], limitations: string[] }

type ReleaseNotesDraft = {
  repoUrl: string;
  fromRef?: string;
  toRef?: string;
  targetTag?: string;
  status: 'drafted' | 'partial' | 'no_changes';
  sections: {
    category: ChangeItem['category'];
    heading: string;
    notes: { text: string; citations: string[] }[];   // citations -> chg IDs
  }[];
  markdown: string;               // rendered customer-facing document
  filteredCount: number;          // chores excluded, for transparency
  limitations: string[];
  changes: ChangeItem[];          // retained bundle for UI
};

type ReleaseNotesPublication = {
  repoUrl: string;
  tag: string;
  url?: string;                   // published release URL
  publishedAt: string;
  approvedBy?: string;
  draftRef: string;               // artifact ref of the approved draft
};
```

## Human Approval Gate (New Structural Section)

This is the first workflow in the series that performs a write, so the approval path is a first-class concern rather than a footnote.

- **Trigger**: only the `vcs.release.publish` (`effect: 'write'`) call. Every read tool runs without pausing.
- **Mechanism**: reuse the existing AI Core contracts — do not invent a bespoke approval store:
  - Before publish, emit `{ type: 'approval_request', data: { runId, approvalId, reason, effect: 'write' } }` and persist a checkpoint via the `CheckpointStore`.
  - The run suspends; AI Core surfaces the pending approval through its run/approval APIs.
  - The frontend/API submits an `ApprovalDecision` (`{ status, note?, decidedBy? }`) to the AI Core resume route, which calls `ReleaseNotesGraph.resume(runId, decision, context)`.
  - `resume()` rehydrates state from the checkpoint, then publishes (approved) or finalizes without publishing (rejected).
- **Auditing**: write both the `approval_*` decision and the resulting publish action to the `AuditLogSink`, including `decidedBy`, target tag, and draft artifact ref. Never log the full notes body as a secret, but the published markdown is a legitimate artifact.
- **Safety invariants**: no publish without a persisted `approved` decision; the target tag/ref is fixed at gate time (cannot be swapped on resume); a rejected or expired approval leaves the repo untouched; idempotency key prevents double-publish on repeated resume.

## Vector Store Integration

- **No new vector infrastructure.** RAG is a secondary tone/style path only: `PriorNotesRetriever` calls the existing `knowledge.retrieve` for prior release notes. Indexing/storage stay owned by `plugin-ai-core-backend-module-retrieval-augmenter` (pgvector/qdrant); runtime/checkpoint state by `plugin-ai-core-backend-module-runtime-store`.
- Retrieval never affects which changes are included (that is deterministic in `categorize.ts`); it only conditions phrasing. A retrieval miss yields a still-valid draft.
- Tests never touch pgvector: mock `context.invokeTool` for `knowledge.retrieve` with pre-baked prior-notes fixtures.

## Background Scheduler Tasks

- `scheduler/cadence.ts` registers one `coreServices.scheduler` task per configured cadence (e.g. weekly Friday 17:00):
  - `id: 'release-notes-cadence-<name>'`, `frequency: { cron }`, bounded `timeout`, non-zero `initialDelay`, `scope: 'global'`.
- Task flow: `cadencePlanner.ts` (pure) maps cadence config → one draft dispatch per configured repo. The task POSTs to `/agents/release-notes-ai-generator/runs` with `auth.getPluginRequestToken` + `discovery.getBaseUrl('ai-core')`, `source: 'scheduler'`. **Scheduled runs stop at the draft/approval gate and never auto-publish** — a human still approves.
- Guardrails: per-repo single dispatch, skip when a previous cadence run for the same repo is in flight (mutex), config kill switch `schedule.enabled` (default **false**).

## Configuration

```yaml
ai:
  agents:
    releaseNotes:
      model: release-notes        # installation-registered model ID, required
      maxPullRequests: 300        # optional, default 300
      maxWindowDays: 90           # optional, default 90 (clamp when no fromRef)
      maxTicketLookups: 100       # optional, default 100
      maxToolInvocations: 20      # optional, default 20
      taxonomy:                   # optional; conventional-commit prefix -> category
        feat: feature
        fix: fix
        perf: improvement
        refactor: improvement
        'BREAKING CHANGE': breaking
        chore: internal
        docs: internal
        test: internal
        ci: internal
      publish:
        enabled: false            # optional, default false; gates vcs.release.publish
      schedule:
        enabled: false            # optional, default false
        cadences:
          - { name: weekly, cron: '0 17 * * 5', repos: ['github.com/acme/web'] }
```

`config.ts` mirrors `readCatalogAiInsightsConfig`: throw when the section or `model` is absent; document all defaults in `config.d.ts`. Publishing requires **both** `publish.enabled: true` and the `vcs.release.publish` tool being registered; otherwise the gate resolves to draft-only.

## Shared AI-Core Work To Build First

- **VCS write + tag/compare contracts (blocking for publish)** — extend `VcsDriver` in `plugin-ai-core-node/src/@types/vcs.ts` with read-only `getReleaseTags`/`compare` and a write `publishRelease(repoUrl, tag, body)`, then register `vcs.release.publish` (`effect: 'write'`) and any new read tools in `plugin-ai-core-backend-module-vcs`. This is shared work (release-notes is the first consumer; `techdocs-ai-*` and scaffolder write-workflows will reuse the write path). Keep the driver provider-neutral (GitHub/GitLab/Bitbucket/Azure).
- **No new approval machinery** — `ApprovalRequest`/`ApprovalDecision`, `resume()`, checkpoint store, and audit sink already exist; this plugin is the first to exercise the write-approval path end to end and should validate it, not replace it.
- If `ToolInvocationResult` summaries prove too lossy for PR parsing (title/body/author needed for categorization), extend the generic result type — never with release-notes-specific fields.

## Frontend Plan

Mirror the catalog-ai-insights frontend layout and wiring exactly (new-frontend-system `alpha.ts`, `extensions/`, self-contained wire types in `@types/`, SSE client over `discoveryApi.getBaseUrl('ai-core')` with `eventsource-parser` and `Last-Event-ID` replay):

```text
plugins/frontend/plugin-ai-agent-frontend-release-notes-ai-generator/
  src/
    index.ts
    alpha.ts
    plugin.ts
    routes.ts                     # rootRouteRef for the standalone release-notes page
    @types/index.ts               # ReleaseNotesRequest/Draft/Publication wire types
    api/
      apiRef.ts
      client.ts                   # ReleaseNotesClient: generate(), streamRunEvents(), submitApproval()
      index.ts
    hooks/
      useReleaseNotesRun.ts       # pure reducer + hook (generate/resume/approve/reject/reset)
    components/
      index.ts
      ReleaseNotesPage.tsx        # standalone: repo/window inputs + drafts + history
      GenerateNotesDialog.tsx     # repoUrl/fromRef/toRef/targetTag inputs
      ReleaseNotesRunView.tsx     # live node/tool progress from SSE
      DraftPreview.tsx            # categorized sections + rendered markdown
      FilteredChangesPanel.tsx    # chores excluded, for transparency
      ApprovalBar.tsx             # approve/reject control shown on approval_request
      PublicationBanner.tsx       # published release link on success
    extensions/
      api.ts
      components.ts
    __tests__/
```

Frontend deltas vs catalog-ai-insights:

- `backstage.pluginId: 'release-notes-ai-generator'`; package `@ai-crew-suite/plugin-agent-release-notes-generator`.
- Primary surface is a **standalone page** (nav item); optionally a catalog entity-page tab scoped to that component's repo.
- `generate()` POSTs `/agents/release-notes-ai-generator/runs` with the JSON `ReleaseNotesRequest`; the draft renders from the `release-notes-draft` artifact event.
- **Approval UX is the distinguishing feature**: when an `approval_request` event arrives, render `ApprovalBar` with approve/reject + note; `submitApproval()` calls the AI Core resume/approval route with an `ApprovalDecision`. On approve, show `PublicationBanner` from the `release-notes-publication` artifact; on reject, show the draft as final-unpublished.
- Render `status: 'no_changes'`, `filteredCount`, and `limitations` prominently; every note line shows its `chg` citations; the markdown preview is copyable even when unpublished.

## Test Strategy

Reuse the catalog plan's test-layer table and network policies. Deltas only:

- **Unit**: `window.ts` clamp/derivation; `categorize.ts` taxonomy mapping + chore filtering (the foundation doc's `feat`/`fix`/`chore` isolation case, conventional-commit prefixes, `BREAKING CHANGE`); `draft.ts` schema validation + uncited-output degradation; `cadencePlanner.ts` mapping.
- **Workflow (runtime) tests**: drive `ReleaseNotesGraph.run()`/`resume()` with a stubbed `WorkflowContext` whose `invokeTool` is a **dynamic mock router keyed by `toolId` + args** — the codebase-accurate replacement for the foundation doc's `github.service`/`jira.service` `createServiceFactory` sketch. Scenarios: mixed PRs categorized and chores filtered; ticket summaries resolved and merged into copy; empty delta → `no_changes`; missing project driver → `partial`.
- **Approval-gate tests (headline)**: assert the run emits `approval_request` and **suspends** before any `vcs.release.publish` call; assert a checkpoint is persisted; `resume()` with `approved` invokes publish exactly once and emits the publication artifact + audit entry; `resume()` with `rejected` publishes **nothing** and finalizes; a repeated approved resume does not double-publish (idempotency). Directly covers the foundation doc's "halts for approval before creating a live release tag" requirement.
- **`knowledge.retrieve` isolation**: pre-baked prior-notes fixtures; assert tone context attaches without changing included changes.
- **Scheduler tests**: `mockServices.scheduler` fast-forwards to a cadence tick; assert one authenticated draft run per repo, `schedule.enabled: false` respected, overlap skipped, and **no auto-publish** (run stops at draft).
- **SSE streaming**: assert step logs mark each `summarize` category finishing before the combined markdown is produced, and the stream stays ordered across the suspend/resume boundary (the foundation doc's SSE-stability requirement).
- **Backend integration**: `startTestBackend` with this module + AI Core + `mockServices.rootConfig` + `mockServices.database`, asserting boot registration, run→SSE order, checkpoint persistence at the gate, resume flow, and artifact/audit persistence.
- **E2E**: extend the shared fixture profile with fixture VCS (incl. a fixture `vcs.release.publish`) + ticket tool modules; Playwright scenario: generate a draft → review categorized sections → approve → assert publication banner + deep-linkable run ID; and a reject path asserting no publication. Add `yarn test:e2e:release-notes`.

## Security and Operational Guardrails

Catalog-ai-insights guardrails apply unchanged (identity propagation, redaction, tool/token/wall-clock caps, correlation IDs). Release-notes-specific additions (write-capable workflow):

- **No publish without a persisted human `approved` decision**; the decision, `decidedBy`, target tag, and draft ref are audit-logged.
- The publish target (repo + tag) is fixed at approval-gate time and re-validated on resume; it cannot be altered by the resume payload.
- Enforce authorization: only users permitted to publish releases for the repo may approve; scheduled runs never carry publish authority.
- Idempotency key on the publish call prevents duplicate releases from repeated resumes or retries.
- Redact tokens/secrets from PR bodies before they enter model context, SSE, artifacts, or audit records; the published markdown is a sanctioned artifact but must still be scrubbed of secret-like strings.

## Ordered Implementation Milestones

### Milestone 0: Schemas and pure logic

- [ ] Define `ReleaseNotesRequest`, `ChangeItem`, `CategoryTaxonomy`, `ReleaseNotesDraft`, `ReleaseNotesPublication`, and the config schema.
- [ ] Implement + unit-test `window.ts`, `categorize.ts` (taxonomy + chore filter), and `cadencePlanner.ts` (pure, no I/O).
- [ ] Confirm read tool IDs against the registered catalog at boot (fail on unknown allow-list entries).

Exit criteria: categorization/filtering and window math pass deterministically; schemas validate fixtures.

### Milestone 1: Draft backend (read-only)

- [ ] Scaffold package, register runner/agent/triggers, implement config parsing; register in root `tsconfig.json` + `.eslintrc.cjs`.
- [ ] Implement gather → enrich → categorize → summarize → draft artifact (no publish yet).
- [ ] Wire the module into `packages/backend` and add the `ai.agents.releaseNotes` config block.
- [ ] Add unit, workflow-scenario (dynamic mock router), and backend integration tests.

Exit criteria: draft generation passes deterministically with no real LLM/service and no write tool.

### Milestone 2: VCS write contract + approval gate

- [ ] Extend `VcsDriver` and `plugin-ai-core-backend-module-vcs` with `getReleaseTags`/`compare` (read) and `publishRelease` + `vcs.release.publish` (`effect: 'write'`).
- [ ] Implement the approval gate: `approval_request`, checkpoint, `resume()` publish/reject, audit entries, idempotency.
- [ ] Approval-gate + resume tests, including no-double-publish and reject-leaves-repo-untouched.

Exit criteria: publish executes only after an `approved` decision; the full run→gate→resume→publish path is proven in the test backend.

### Milestone 3: Scheduler and frontend + E2E

- [ ] Implement cadence scheduling (draft-only) with guardrails and tests.
- [ ] Implement the frontend (generate, SSE run view, draft preview, filtered panel, approval bar, publication banner) and register it in `packages/app`.
- [ ] Component tests (loading, streaming, approval request, approve/reject, reconnect/replay) + accessibility checks.
- [ ] Extend the E2E fixture profile and add Playwright approve and reject scenarios with screenshot review.

Exit criteria: `yarn test:e2e:release-notes` demonstrates draft → approve → publish and draft → reject → no-publish in a browser without external infrastructure.

### Milestone 4: Production readiness

- [ ] Document model registration, VCS/ticket driver configuration, publish enablement, approval permissions, and cadence setup.
- [ ] Dashboards/alerts for failed runs, approval latency, publish failures, chore-filter rate, and token/cost.
- [ ] Opt-in real-model evaluation suite (grounding: every note cites an included `chg` ID; no chores leak into customer copy; no fabricated versions/authors) within budget.

Exit criteria: staged rollout with publish + schedules disabled by default, bounded costs, verified approval auditing and citation grounding.

## Definition of Done

- Package, agent, runner (`run` + `resume`), triggers, config schema, read allow-list, and the gated `vcs.release.publish` write tool implemented and registered (root + app/backend + VCS-module wiring included).
- Runs execute through the real AI Core controller/runtime with persisted, replayable events, checkpoints at the gate, token/cost usage, and `release-notes-draft` / `release-notes-publication` artifacts.
- Deterministic categorization/chore-filtering is proven on mixed fixtures; the approval gate provably blocks publish until an `approved` decision and never double-publishes.
- Scheduled cadence produces draft-only runs; frontend renders categorized drafts and the approve/reject gate over live SSE and replay; Playwright verifies both approve and reject paths.
- No output surface (SSE, artifacts, logs, audit, tests) contains secrets, raw tokens, uncited model claims, or a publish action lacking a recorded human approval.

## Completed Backend

### Implemented: draft-generation milestone

The module now provides a readable, JSDoc-documented, deterministic draft workflow:

1. Validates a versioned `ReleaseNotesRequest` for one repository and target version.

2. Collects bounded merged pull requests through `vcs.pull_request.list`.

3. Deterministically categorizes PR titles using configured taxonomy:

   - `feature`
   - `fix`
   - `improvement`
   - `breaking`
   - `internal`

4. Filters internal chores before customer-facing draft generation.

5. Builds a citation-safe `ReleaseNotesDraft` artifact:

   - stable `chg-N` references
   - categorized sections
   - markdown preview
   - `filteredCount`
   - `no_changes` / `partial` / `drafted` statuses
   - limitations

6. Emits the replayable `release-notes-draft` artifact through the normal AI Core event path.

### Agent and module registration

Added:

- `release-notes-ai-generator` AI Core agent

- Read-only tool allow-list:

  - `vcs.pull_request.list`
  - `project.ticket.get`
  - `project.ticket.search`
  - `knowledge.retrieve`

- Workflow runner: `release-notes`

- Manual and scheduler trigger bindings

- Required config parsing under:
  - `ai.agents.releaseNotes`

- Backend application registration in:

  - `/home/kevin/Repos/backstage/ai-crew-suite/packages/backend/package.json`
  - `/home/kevin/Repos/backstage/ai-crew-suite/packages/backend/src/index.ts`

- Root TypeScript/ESLint registration and Yarn workspace lockfile update.

- Active config entry in:
  - `/home/kevin/Repos/backstage/ai-crew-suite/app-config.yaml`

### Publish/approval boundary

I intentionally did __not__ implement a fake publish or approval-resume path.

The implementation plan correctly identifies a blocking shared prerequisite: the current codebase has no provider-neutral `VcsDriver.publishRelease()` method and no registered `vcs.release.publish` write tool. Implementing approval events without a real write contract would falsely suggest publication can occur safely.

The plugin is explicitly documented and implemented as __draft-only__ until that shared VCS capability is added. If `publish.enabled` is configured, the draft records a limitation rather than attempting a write.

### Tests

Added deterministic coverage for:

- conventional title categorization
- breaking-change detection
- internal chore filtering
- no-changes draft behavior
- backend module registration, agent shape, tool allow-list, and triggers

They were scaffolding remnants from the implementation plan, not intentional required empty directories.

- `src/retrieval/`

  - Planned for `PriorNotesRetriever.ts`, which would call `knowledge.retrieve` for prior-release-note style/context.
  - The current draft workflow does not invoke retrieval yet, so it is unused.

- `src/scheduler/`

- `src/scheduler/__tests__/`

  - Planned for optional scheduled draft generation (`cadencePlanner.ts` and cadence dispatch tests).
  - The module currently registers manual/scheduler triggers but does not register an actual cadence task, so these are unused.

They should be removed until that functionality is implemented. Empty directories are not tracked by Git, so they will not appear in the committed change unless they contain hidden/generated files. The intended source files currently tracked for the plugin do not include either directory.

## Completed Frontend

Implemented the paired frontend plugin at:

`/home/kevin/Repos/backstage/ai-crew-suite/plugins/frontend/plugin-ai-agent-frontend-release-notes-ai-generator`

### Delivered

- Typed frontend wire contracts for:

  - `ReleaseNotesRequest`
  - `ReleaseNotesDraft`
  - future `ReleaseNotesPublication`
  - approval decisions
  - AI Core SSE events

- Typed AI Core client:

  - `generate()` → `POST /agents/release-notes-ai-generator/runs`
  - `streamRunEvents()` with `Last-Event-ID` replay
  - `submitApproval()` → `POST /runs/:id/approvals`

- Pure `useReleaseNotesRun` reducer/hook handling:

  - live and replayed progress/tool events
  - `release-notes-draft` artifact extraction
  - future `release-notes-publication` artifacts
  - approval requests
  - terminal error/done states

- Standalone route:

  - `/release-notes-ai-generator`
  - deep-link/replay through `?run=<id>`

- UI components:

  - generation dialog with repository, target version, and optional date-window fields
  - live run-progress view
  - categorized cited draft preview
  - copyable markdown preview
  - transparent internal-chore filtering panel
  - no-changes and limitations states
  - future approval bar and publication banner components

### App and monorepo registration

Registered the frontend package in:

- `/home/kevin/Repos/backstage/ai-crew-suite/tsconfig.json`
- `/home/kevin/Repos/backstage/ai-crew-suite/.eslintrc.cjs`
- `/home/kevin/Repos/backstage/ai-crew-suite/packages/app/package.json`
- `/home/kevin/Repos/backstage/ai-crew-suite/packages/app/src/App.tsx`
- `/home/kevin/Repos/backstage/ai-crew-suite/packages/app/src/App.test.tsx`
- `/home/kevin/Repos/backstage/ai-crew-suite/yarn.lock`

### Approval/publish limitation

The frontend has a real typed approval client and conditional approval UI, but the current paired backend remains intentionally draft-only because the shared `vcs.release.publish` write-tool contract does not exist yet.

Therefore:

- normal runs render the draft, filtering, no-changes, and limitations paths;
- approval controls render only when a future backend emits `approval_request`;
- no UI path implies that publication is currently available.

