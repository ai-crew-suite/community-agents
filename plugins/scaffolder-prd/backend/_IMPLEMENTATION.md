# Scaffolder AI PRD Implementation Plan

## Overview

This plugin automatically parses Product Requirement Documents (PRDs) and translates them into actionable engineering templates and task definitions during the scaffolding phase.

- **The Task**: Transforming a raw Product Requirement Document (PRD) into a comprehensive, multi-entity project footprint spanning ticketing, code repositories, and documentation.
- **The Logic**: When a user submits a PRD, a stateful LangGraph multi-agent network distributes the work to specialized node agents. The **Product Manager node** translates product specs into structured Jira Epics and Stories, the **Engineer node** parses technical mandates to determine which Backstage Software Templates to configure, and the **Technical Writer node** generates the baseline architectural documentation. The execution automatically freezes at a persistent database checkpoint for engineering lead sign-off before executing any write operations across external tools.

## Goal

Implement `@ai-crew-suite/plugin-agent-scaffolder-prd-backend` as an AI Core backend module that turns one raw Product Requirements Document into a **cited, multi-domain delivery blueprint**. Three specialist nodes run concurrently over the same parsed PRD — a **Product Manager** node deriving an epic/story hierarchy, an **Engineer** node selecting the Software Template and its parameters, and a **Technical Writer** node outlining baseline architecture docs. Their outputs merge deterministically into a single `DeliveryBlueprint`, the run freezes at a human approval checkpoint, and only after sign-off does it commit the external writes (tickets, then the scaffolder task). A paired frontend plugin renders the three channels streaming in parallel, the merged plan, and the approval bar.

Reuse the architecture proven by `plugin-ai-agent-backend-catalog-ai-insights` (its `_IMPLEMENTATION.md` is the source of truth for repository conventions, workflow-runner mechanics, event contracts, monorepo wiring, and test-layer definitions), and reuse the **implemented** parallel fan-out pattern from `plugin-ai-agent-backend-rfc-adr-ai-reviewer` (`ReviewGraph.ts` already does `Promise.all` over `nodes/seniorArchitect.ts` + `nodes/securityLead.ts` with per-node `step` events). This plan documents only what differs: **three-channel fan-out/join**, **cross-domain blueprint merging**, and a **multi-write transactional commit** behind one approval gate.

## Delivery Boundary

### In scope

- One PRD per run, via the generic `/agents/scaffolder-ai-prd/runs` route.
- Deterministic `prd.parse → fan-out(pm | engineer | writer) → join.merge → gate → commit` graph. Parsing, channel merging, blueprint validation, and commit ordering are pure code; each node's model call produces only its own domain proposal.
- Bounded reads: `project.ticket.search` (duplicate-epic detection), template schemas via `scaffolderServiceRef.getTemplateParameterSchema`, catalog lookups, `vcs.repository.read_file` for existing docs, and `knowledge.retrieve` for prior PRDs/standards.
- A structured, citation-required `DeliveryBlueprint` artifact where **every** derived item cites a PRD span or retrieved-context ID.
- Per-node SSE streaming so the UI can render the three channels distinctly.
- An `approval_request` covering the whole blueprint, then — on approval only — a bounded, idempotent, partial-failure-tolerant commit emitting a `DeliveryExecution` artifact.

### Explicitly out of scope for v1

- **Autonomous commits.** No ticket, task, or doc write occurs before a persisted human approval; `execute.enabled` defaults to `false`, in which case the run terminates at the blueprint.
- Rolling back already-created tickets if a later write fails. v1 records partial success precisely and surfaces what remains; compensating deletes are not attempted (and `ProjectManagementDriver` has no delete operation).
- Editing or reformatting the source PRD, or writing back into the PRD system.
- Ticket-hierarchy depth beyond epic → story. Sub-tasks, story-point estimation as fact, and dependency-link creation are out (`CreateTicketInput` supports only a single `parentId`).
- Committing documentation to a repository in v1 — the writer node produces an **outline artifact**; publishing it needs `vcs.pull_request.create` (see Prerequisites).
- Multi-PRD or portfolio planning; one document per run.

## Required Prerequisites

Contracts verified against the current codebase and the installed Backstage SDK. As with the catalog plan: no fictional service refs — the foundation doc's `jira.service` (`createEpicWithStories`) and `scaffolder.service` (`executeTemplateJob`) `createServiceRef` sketches must **not** be implemented as written.

**Correction to the earlier draft:** ticket creation is *not* blocked. `project.ticket.create` already exists with `effect: 'write'`, and `ProjectManagementDriver.createTicket(input: CreateTicketInput)` supports `parentId`, so the epic→story hierarchy is expressible today. Combined with the real `scaffolderServiceRef.scaffold()`, **two of the three commit paths are available now**; only documentation publishing is gated.

| Capability | Required contract | Current state | Required action |
| --- | --- | --- | --- |
| PRD ingestion | Inline `prdText`, or `vcs.repository.read_file` / `coreServices.urlReader` for a `prdUrl` | Exist | Cap at `maxPrdChars`; treat PRD text as untrusted input. |
| Duplicate-epic detection | `project.ticket.search` | **Exists**, `effect: read` | Search before proposing an epic so a re-submitted PRD does not duplicate tracking buckets. |
| Ticket context | `project.ticket.get` | Exists, `effect: read` | Enrich a matched parent epic when the PRD references one. |
| **Ticket creation (write #1)** | `project.ticket.create` → `createTicket(CreateTicketInput)` returning `TicketSummary` | **Exists**, `effect: 'write'`; `CreateTicketInput` = `{ title, description?, team?, labels?, priority?, parentId? }` | Replaces the invented `createEpicWithStories`. There is no batch/epic-with-children op, so the commit creates the **epic first**, then each story with `parentId` set to the returned epic ID — an inherently sequential, partially-failable loop (see Transactional Commit). |
| Template schema + selection | `scaffolderServiceRef.getTemplateParameterSchema({ templateRef }, { credentials })` | **Exists** (`@backstage/plugin-scaffolder-node@0.13.5`, ref `id: 'scaffolder-client'`, `scope: 'plugin'`) | Engineer node coerces PRD facts against the **real** schema for allow-listed templates. |
| **Scaffolder task (write #2)** | `scaffolderServiceRef.scaffold(ScaffolderScaffoldOptions, { credentials })` | **Exists** | Replaces the invented `executeTemplateJob`. Called post-approval with the approver's credentials. Overlaps `scaffolder-ai-intent` — reuse its `TemplateResolver` shape rather than duplicating. |
| Catalog name/owner checks | `catalogServiceRef` adapter (`getEntityByRef` / `getEntities`) | Pattern **exists** (`CatalogContextResolver`) | Engineer node checks the proposed component name is free; writer node resolves owner for doc front-matter. |
| Existing docs context | `vcs.repository.read_file`, `vcs.repository.search` | Exist, `effect: read` | Writer node reads current `docs/` structure so the outline extends rather than duplicates. |
| Prior PRDs / standards | `knowledge.retrieve` + `DefaultRetrievalPipeline` | Exists | Supplies precedent and house doc structure as cited context — never as a substitute for PRD content. |
| **Documentation publish (write #3)** | `vcs.pull_request.create` (**new, `effect: 'write'`**) | **Not present** — all `vcs.*` tools are `effect: read`; no TechDocs/docs write tool exists anywhere | Out of scope for v1: the writer node emits an outline artifact only. Shared with `alert-ai-tuner` and `scaffolder-ai-drift-detector` — build once in `plugin-ai-core-backend-module-vcs`. **Blocking for doc publishing only.** |
| Approval gate | `ApprovalRequest` / `ApprovalDecision`, `WorkflowRunner.resume()`, `CheckpointStore`, `AuditLogSink` | **Exist** | Implement `PrdGraph.resume()`; checkpoint the frozen blueprint; audit decision, actor, and blueprint hash. |
| Parallel fan-out + per-node events | `Promise.all` over node modules; `step` events carry `node` | **Implemented precedent** — `rfc-adr-ai-reviewer/src/workflow/ReviewGraph.ts` fans out to two nodes with per-node `step` events | Follow it directly with three channels. |
| **Per-node token streaming** | `token` event carrying an optional `node` label | **Not landed** — `plugin-ai-core-node/src/@types/run.ts:297` still declares `{ type: 'token'; data: { runId, text } }` with no `node` | The rfc-adr plan specified this generic addition but it has not shipped. Add the optional `node?` field there (backward compatible), or fall back to `step`-only channel attribution. **Blocking for per-node token UI, not for the workflow.** |

## Package Shape

Backend module from the same template as `catalog-ai-insights`, with a `nodes/` directory mirroring the **implemented** `rfc-adr-ai-reviewer` layout. Every directory carries a barrel `index.ts` re-exporting its public surface, matching the reference plugin's export styling.

```text
plugins/backend/plugin-ai-agent-backend-scaffolder-ai-prd/
  package.json          # role: backend-plugin-module, pluginId: ai-core
                        # deps incl. @backstage/plugin-scaffolder-node
  tsconfig.json
  config.d.ts
  README.md
  src/
    index.ts            # barrel: module default + public types
    module.ts           # registers runner, agent, trigger
    agent.ts            # SCAFFOLDER_PRD_AGENT_ID, tool allow-list, per-node prompts
    config.ts           # readScaffolderPrdConfig (ai.agents.scaffolderPrd)
    workflow/
      index.ts          # barrel
      PrdGraph.ts               # WorkflowRunner id 'scaffolder-prd' (run + resume)
      state.ts                  # PrdState: shared channels, one per node
      parse.ts                  # pure: PRD text -> PrdFacts + cited spans
      merge.ts                  # pure: three channels -> DeliveryBlueprint
      blueprint.ts              # DeliveryBlueprint schema, validation, degradation
      commit.ts                 # post-approval ordered multi-write executor
    nodes/
      index.ts          # barrel
      productManager.ts         # PRD spans -> EpicBlueprint + StoryBlueprint[]
      engineer.ts               # PRD spans + template schema -> TemplateBlueprint
      technicalWriter.ts        # PRD spans + existing docs -> DocumentationBlueprint
    services/
      index.ts          # barrel
      TemplateResolver.ts       # scaffolderServiceRef adapter (shared shape with -intent)
      TicketPlanner.ts          # project.ticket.* adapter: dedupe probe + ordered creation
      PrdCatalogResolver.ts     # catalogServiceRef adapter: name free, owner resolution
      PrdToolRunner.ts          # capped invokeTool facade (mirrors ReviewToolRunner)
      PrdArtifactWriter.ts
    @types/
      index.ts          # barrel: shared request/blueprint contracts
    __tests__/
    workflow/__tests__/
    nodes/__tests__/
    services/__tests__/
```

- `createBackendModule` with `pluginId: 'ai-core'`, `moduleId: 'agent-scaffolder-ai-prd'`.
- `module.ts` deps: `coreServices.rootConfig`, `coreServices.logger`, `coreServices.urlReader`, `coreServices.discovery`, `coreServices.auth`, `catalogServiceRef`, `scaffolderServiceRef`, plus `agentExtensionPoint`, `triggerExtensionPoint`, `workflowRunnerExtensionPoint`. **No new core service keys**; `coreServices.scheduler` is intentionally unused (PRD submission is interactive).
- Package naming, scripts, Apache header, root `tsconfig.json` references, and `.eslintrc.cjs` role overrides follow `catalog-ai-insights` and `plugin-registration.md` verbatim (not repeated here).

## Monorepo And App Wiring

Same delegated-but-verified steps as `catalog-ai-insights` (see that plan's "Monorepo And App Wiring"). Deltas:

- **Backend load**: add `"@ai-crew-suite/plugin-agent-scaffolder-prd-backend": "workspace:^"` to `packages/backend/package.json` and the matching `backend.add(loadBackendFeature(import(...)))` line in `packages/backend/src/index.ts`. It must load **after** `@backstage/plugin-scaffolder-backend` so `scaffolderServiceRef` resolves.
- **Driver gates**: ticket commits need `plugin-ai-core-backend-module-project-management` plus its Jira driver loaded and configured. With no driver the blueprint still generates, the ticket section is marked unavailable with a limitation, and the commit skips tickets rather than failing the run.
- **App config**: the module throws at boot without `ai.agents.scaffolderPrd.model` and a non-empty `templates.allowed`; add the config block (see Configuration). Commits additionally require `execute.enabled: true`.
- **Frontend registration**: `plugins/frontend/plugin-ai-agent-frontend-scaffolder-ai-prd/` exists but is **empty** — it must be scaffolded from scratch. Add `"@ai-crew-suite/plugin-agent-scaffolder-prd-backend": "workspace:^"` to `packages/app/package.json`, import its `/alpha` default export in `packages/app/src/App.tsx`, and extend plugin-ID expectations in `packages/app/src/App.test.tsx`.
- **Optional core edit**: adding `node?` to the `token` event in `plugin-ai-core-node/src/@types/run.ts` touches a root-shared package — run `yarn typecheck --force` / `yarn lint --force` afterward.
- **Yarn PnP refresh**: `yarn install` after any `package.json` edit.

## Agent Definition

```ts
{
  id: 'scaffolder-ai-prd',
  modelRef: config.modelRef,          // installation-registered ID, e.g. 'scaffolder-prd'
  workflowRef: 'scaffolder-prd',
  memory: 'none',                     // each PRD is a fresh document; no cross-run carryover
  systemPrompt: SCAFFOLDER_PRD_SYSTEM_PROMPT,   // base; node prompts layered per channel
  toolIds: [
    'project.ticket.search',
    'project.ticket.get',
    'vcs.repository.read_file',
    'vcs.repository.search',
    'knowledge.retrieve',
    'project.ticket.create',          // effect: 'write' — only invoked post-approval
  ],
  triggers: [
    { id: 'prd-submit-on-demand', source: 'manual', agentId: 'scaffolder-ai-prd' },
  ],
}
```

- All read tools run freely during fan-out. `project.ticket.create` is `effect: 'write'`, so AI Core pauses with an `approval_request` before it executes — the plugin must not bypass this. Omit it from the allow-list until a project-management driver is configured; the workflow then terminates at the blueprint.
- `scaffolderServiceRef.scaffold()` is **not** a tool: it is an injected typed service called only from `commit.ts` on the resume path, so no model action can spawn a task. Ticket creation is tool-mediated and therefore additionally gated by AI Core's write policy — two different mechanisms, both closed.
- Three **node prompts** layer over the base prompt, one per channel: `PRODUCT_MANAGER_PROMPT`, `ENGINEER_PROMPT`, `TECHNICAL_WRITER_PROMPT`. Each node sees only the parsed PRD spans plus its own domain context, so the writer cannot invent tickets and the PM cannot pick templates.
- System prompt rules: derive **only** from supplied PRD spans and retrieved context — never invent requirements, scope, estimates, or owners; cite `prd-N` for every derived item and `kb-N` for precedent; propose template parameters only for fields present in the supplied schema; state uncertainty as an open question rather than guessing; never claim anything was created.

## Run Input Contract

The generic `AgentRunInput.input.query` carries a versioned JSON payload:

```ts
type PrdRequest = {
  version: 1;
  source: 'manual';
  prdText?: string;              // inline PRD; one of prdText | prdUrl required
  prdUrl?: string;               // read via vcs.repository.read_file or urlReader
  title?: string;                // overrides a title parsed from the document
  team?: string;                 // target board/project for tickets
  templateHint?: string;         // allow-listed template ref to bias the engineer node
  repoUrl?: string;              // existing repo for docs context
  channels?: ('pm' | 'engineer' | 'writer')[];  // default all three
};
```

Validation requires exactly one of `prdText` / `prdUrl`, caps the resolved document at `maxPrdChars`, rejects a `templateHint` outside `templates.allowed`, and treats the PRD body as untrusted prompt input.

## PRD Workflow (Parallel Multi-Agent)

`PrdGraph` registers as `WorkflowRunner` id `scaffolder-prd` and implements **both** `run()` and `resume()`. It realizes the foundation doc's fork-join graph: **Parse PRD → Fork into Concurrent Nodes → Join & Aggregate State → Human Approval Gate → Commit Actions**. Parsing, merging, and commit ordering are deterministic; each node's model call produces only its domain proposal.

### Deterministic graph nodes

1. **prd.parse** — validate `PrdRequest`; resolve the document (inline or via read tool/urlReader). `parse.ts` splits it into addressable, cited **spans** (`prd-1`, `prd-2`, …) by heading/paragraph, extracts `PrdFacts` (title, goals, explicit technical mandates, named systems), and caps span count. An empty or unparseable document terminates as `unparseable` with **no** model calls.
2. **fan-out (parallel)** — the three nodes run concurrently via `Promise.all`, exactly as `ReviewGraph.ts` does today, each emitting node-tagged `step` enter/exit events and writing **only to its own channel**:
   - **productManager** (`nodes/productManager.ts`): `project.ticket.search` for an existing epic matching the PRD title (dedupe), then one model call deriving `EpicBlueprint` + `StoryBlueprint[]`, each citing `prd-N`. Story count capped at `maxStories`.
   - **engineer** (`nodes/engineer.ts`): resolve allow-listed template schemas via `TemplateResolver`, deterministically rank them against `PrdFacts` (reusing the `scaffolder-ai-intent` selection shape), then coerce parameters against the **real** schema and check component-name availability via `PrdCatalogResolver`. Produces `TemplateBlueprint`.
   - **technicalWriter** (`nodes/technicalWriter.ts`): read the existing `docs/` structure via `vcs.repository.search`/`read_file` and house patterns via `knowledge.retrieve`, then produce `DocumentationBlueprint` — an outline of file paths plus per-file section headings, not full prose.
   Nodes are independent: a failure or missing driver in one records a limitation and yields an **empty channel** without aborting the others (the foundation doc's graceful-merge requirement).
3. **join.merge** — **deterministic** merge (`merge.ts`), no LLM: assemble the three channels into one `DeliveryBlueprint`, resolve cross-channel links (stories reference the template's component name; doc paths reference the same component), drop uncited items, and compute `readiness` from which channels populated. This is what the foundation doc's "assert `jiraBlueprint`, `scaffolderBlueprint`, and `documentationBlueprint` are all fully populated" test inspects. Emits the `delivery-blueprint` artifact.
4. **gate** — when `execute.enabled` and at least one committable channel exists, emit `approval_request` carrying the full blueprint plus its `blueprintHash`, checkpoint, and **suspend**. With execution disabled the run finalizes as `blueprint_only` — a legitimate terminal state.
5. **commit** *(resume path)* — `resume(runId, decision, context)`: on `approved`, `commit.ts` executes the ordered write plan (see Transactional Commit) with the approver's credentials, emits a `delivery-execution` artifact plus audit record, and finishes `committed` or `partially_committed`; on `rejected`, records the decision and finishes `declined` with no writes.

### State and output schema

```ts
type EvidenceRef = { id: string; source: 'prd' | 'ticket' | 'template' | 'catalog' | 'docs' | 'knowledge'; summary: string; reference?: string };

type PrdSpan = { id: string; heading?: string; text: string };   // 'prd-1' ...

type EpicBlueprint = {
  title: string;
  description: string;
  team?: string;
  labels?: string[];
  existingTicketId?: string;      // set when the dedupe probe matched
  evidence: string[];             // prd-N
};

type StoryBlueprint = {
  id: string;                     // 'story-1' ... local plan ID, not a ticket key
  title: string;
  description: string;
  priority?: string;
  labels?: string[];
  evidence: string[];             // prd-N
};

type TemplateBlueprint = {
  templateRef?: string;           // allow-listed ref only
  score?: number;                 // deterministic ranking score
  parameters: { field: string; value: unknown; origin: 'prd' | 'default' | 'identity'; evidence: string[] }[];
  componentNameAvailable?: boolean;
  issues: string[];               // schema/name problems blocking the scaffold commit
  evidence: string[];             // prd-N / tpl-N
};

type DocumentationBlueprint = {
  files: { path: string; sections: string[]; evidence: string[] }[];  // outline only
  extendsExisting: string[];      // existing doc paths the outline builds on
  evidence: string[];             // prd-N / docs-N / kb-N
};

// PrdState (shared channels, one writer each):
// { request, spans: PrdSpan[], facts,
//   channels: { pm?: { epic, stories }, engineer?: TemplateBlueprint, writer?: DocumentationBlueprint },
//   limitations: string[],
//   status: 'blueprint_only'|'awaiting_approval'|'committed'|'partially_committed'
//         |'declined'|'unparseable'|'partial' }

type DeliveryBlueprint = {
  title: string;
  blueprintHash: string;          // canonical hash of the committable plan
  readiness: 'complete' | 'partial';   // all three channels vs some empty
  epic?: EpicBlueprint;
  stories: StoryBlueprint[];
  template?: TemplateBlueprint;
  documentation?: DocumentationBlueprint;
  openQuestions: string[];        // model-surfaced ambiguities, cited
  limitations: string[];
  evidence: EvidenceRef[];        // prd-N + tpl-N + docs-N (+ kb-N) bundle
};

type DeliveryExecution = {
  blueprintRef: string;           // artifact ref of the approved blueprint
  blueprintHash: string;
  approvedBy: string;
  epicTicketId?: string;
  storyTicketIds: { storyId: string; ticketId: string }[];
  scaffolderTaskId?: string;
  skipped: { target: string; reason: string }[];   // e.g. docs (no write tool)
  failures: { target: string; reason: string }[];  // partial-commit record
  outcome: 'committed' | 'partially_committed';
};
```

Status mapping is fixed in code, not inferred: all three channels populated → `readiness: 'complete'`; any empty channel → `partial` with a limitation naming the channel; `execute.enabled: false` → `blueprint_only`; approved with every planned write succeeding → `committed`; approved with at least one failure → `partially_committed`; rejected → `declined`.

## Shared-Channel Fan-Out And Join (New Structural Section)

The foundation doc's second explicit test is that concurrent nodes merge without race conditions or schema drift, so the concurrency model is stated precisely.

- **Single-writer channels.** `PrdState.channels` has one slot per node and each node writes only its own slot. There is no shared mutable accumulator, so the race condition the foundation doc worries about is structurally impossible rather than defended against with locking.
- Nodes receive **immutable inputs**: the frozen `PrdSpan[]` and `PrdFacts`. A node cannot influence a sibling's input, which is what makes concurrent execution safe and results reproducible.
- **Failure isolation** follows the implemented rfc-adr pattern: each node is wrapped so a rejection or missing driver becomes an empty channel plus a named limitation, never an aborted run. `Promise.all` runs over already-safe wrappers, so one slow or failing domain does not lose the other two.
- `merge.ts` is pure and total: `(channels, facts) => DeliveryBlueprint`. Because it is pure, the foundation doc's "inspect transient state immediately prior to the approval gate" assertion is a direct unit test on its output.
- **Cross-channel consistency is resolved in the merge, not negotiated between nodes.** The engineer's component name is authoritative; the merge rewrites story titles and doc paths referencing the component so all three domains agree. Conflicting names become a limitation, not a silent pick.
- Deterministic ordering: the merge sorts stories by PRD span order and doc files by path, so two runs over the same PRD yield identical blueprints and a stable `blueprintHash`.

## Transactional Commit (New Structural Section)

Committing spans multiple external systems with no distributed transaction, so ordering and partial failure are specified explicitly.

- **Ordered, dependency-driven plan** built by `commit.ts` before any call: (1) epic via `project.ticket.create` (skipped when `existingTicketId` matched); (2) each story via `project.ticket.create` with `parentId` set to the epic's returned ID; (3) the scaffolder task via `scaffolderServiceRef.scaffold()`. Stories genuinely depend on the epic's ID, so this ordering is forced by `CreateTicketInput`, not a preference.
- **No rollback, precise reporting.** `ProjectManagementDriver` exposes no delete, so a mid-loop failure cannot be undone. `commit.ts` records every success in `storyTicketIds` and every failure in `failures`, returns `partially_committed`, and the UI shows exactly what exists and what does not. Inventing a rollback that silently fails would be worse than reporting honestly.
- **Idempotency by `(blueprintHash, target)`.** A repeated approved resume re-reads the prior `DeliveryExecution` and skips already-created targets, so double-clicking approve cannot duplicate an epic or spawn a second task — the safeguard the foundation doc's resume test implies.
- **Per-target credentials and audit.** Ticket creation goes through the write-gated tool; the scaffolder task uses the approver's `BackstageCredentials`. Each target's outcome, ID, and `blueprintHash` is audited individually, so provenance survives a partial commit.
- **Documentation is `skipped`, not failed** in v1, with reason `no vcs write tool`. Recording it as a skip keeps the distinction between "could not" and "chose not to" visible in the artifact.
- Commit is bounded: `maxStories` caps the loop and a wall-clock budget aborts remaining writes rather than hanging the resume request — aborted targets land in `failures` with a timeout reason.

## Per-Node Streaming

- Follow the implemented rfc-adr approach: emit `step` `{ node: 'product-manager' | 'engineer' | 'technical-writer' | 'merge', phase }` at every node boundary. `step` already carries `node`, so channel attribution needs no contract change and works today.
- For streamed model text, the `token` event currently has **no** `node` field (`run.ts:297`). Two options, in order of preference: (a) land the generic optional `node?` addition the rfc-adr plan specified — backward compatible and useful to every future multi-node workflow; (b) ship v1 with `step`-only attribution, where the UI shows per-channel progress and status but not interleaved per-channel tokens.
- Cross-node token ordering is best-effort by definition (the nodes are parallel); within a node, order is preserved. Tests assert distinctly tagged `step` segments for all three nodes precede the `merge` step and the final artifact.

## Vector Store Integration

- **No new vector infrastructure.** `knowledge.retrieve` supplies precedent — prior PRDs, house epic/story conventions, existing documentation structure — as cited `kb-N` context. Indexing/storage remain owned by `plugin-ai-core-backend-module-retrieval-augmenter` and the pgvector/qdrant modules; run/checkpoint state by `plugin-ai-core-backend-module-runtime-store`.
- Retrieval **must never** substitute for PRD content: an item citing only `kb-N` with no `prd-N` is dropped by `blueprint.ts` as unsupported by the source document. Tests assert the blueprint is structurally identical with retrieval enabled and disabled, differing only in prose quality.

## Configuration

```yaml
ai:
  agents:
    scaffolderPrd:
      model: scaffolder-prd         # installation-registered model ID, required
      maxPrdChars: 40000            # optional, default 40000
      maxSpans: 120                 # optional, default 120 addressable PRD spans
      maxStories: 20                # optional, default 20 (also caps the commit loop)
      maxToolInvocations: 18        # optional, default 18 across all three nodes
      commitTimeoutSeconds: 120     # optional, default 120 wall-clock commit budget
      templates:                    # REQUIRED, non-empty; engineer-node candidates
        allowed:
          - template:default/node-service-template
          - template:default/react-app-template
      tickets:
        team: PROJ                  # optional default board/project
        labels: ['prd-generated']   # optional labels applied to created tickets
        dedupeSearch: true          # optional, default true (existing-epic probe)
      documentation:
        paths: ['docs/index.md', 'docs/architecture.md']  # optional outline targets
      execute:
        enabled: false              # optional, default false; gates ALL commits
```

`config.ts` mirrors `readCatalogAiInsightsConfig`: throw when the section, `model`, or a non-empty `templates.allowed` is absent; document every default in `config.d.ts`. Commits require **both** `execute.enabled: true` and an approved decision; ticket commits additionally require a configured project-management driver.

## Shared AI-Core Work To Build First

- **`token.node` event field (optional, generic)** — add `node?: string` to `{ type: 'token' }` in `plugin-ai-core-node/src/@types/run.ts`. Specified by the rfc-adr plan but **not shipped**; it is backward compatible and benefits every multi-node workflow. Without it, ship `step`-only channel attribution.
- **`vcs.pull_request.create` (blocking for doc publishing only)** — the same provider-neutral write tool `alert-ai-tuner` and `scaffolder-ai-drift-detector` need. Build once in `plugin-ai-core-backend-module-vcs`; until then the writer channel is outline-only.
- **Reuse, do not duplicate, `scaffolder-ai-intent` work** — `TemplateResolver` (allow-listed schema fetch + cache) and its deterministic ranking/coercion logic solve the same problem here. Extract to a shared location if both plugins land, rather than maintaining two rankers that could disagree.
- **Catalog adapter reuse** — `PrdCatalogResolver` follows the existing `CatalogContextResolver` shape (`CatalogClientLike` + `CatalogTokenProvider`); promote to `plugin-ai-core-node/src/catalog/` if the shared `CatalogEntityResolver` lands first.
- **No new fan-out, approval, or persistence machinery** — `Promise.all` node fan-out is already implemented in rfc-adr; approval types, `resume()`, checkpoints, audit, and runtime stores all exist and are exercised as-is.

## Frontend Plan

Mirror the `catalog-ai-insights` frontend layout and wiring exactly: `alpha.ts` composing extensions into a `createFrontendPlugin` `FrontendFeature`, `extensions/api.ts` using `ApiBlueprint.make({ params: defineParams => defineParams(createApiFactory({...})) })`, `extensions/components.ts` using `PageBlueprint.make({ name, params: { path, title, routeRef, loader } })` with lazy `import(...)` loaders, self-contained wire types in `@types/`, and an SSE client over `discoveryApi.getBaseUrl('ai-core')` with `eventsource-parser` and `Last-Event-ID` replay. Every directory carries a barrel `index.ts`. The package directory exists but is **empty** — scaffold it from scratch.

```text
plugins/frontend/plugin-ai-agent-frontend-scaffolder-ai-prd/
  src/
    index.ts                      # barrel: public components/api/types
    alpha.ts                      # createFrontendPlugin: pluginId + extensions
    plugin.ts                     # legacy-system plugin + routable extension
    routes.ts                     # ROOT_PATH + rootRouteRef
    @types/
      index.ts                    # PrdRequest/DeliveryBlueprint/DeliveryExecution wire types
    api/
      index.ts                    # barrel
      apiRef.ts                   # scaffolderPrdApiRef
      client.ts                   # ScaffolderPrdClient: submitPrd(), streamRunEvents(), submitApproval(), listBlueprints()
    hooks/
      index.ts                    # barrel
      usePrdRun.ts                # pure reducer + hook (submit/approve/reject/reset)
      useBlueprintList.ts         # blueprint history for the review page
    components/
      index.ts                    # barrel
      PrdTranslatorPage.tsx       # standalone: PRD submission + blueprint history
      PrdSubmitForm.tsx           # paste/URL + team/template hint inputs
      ChannelProgressPanel.tsx    # the three parallel channels, live from step events
      EpicStoryTree.tsx           # epic -> stories with prd-N citations
      TemplatePlanPanel.tsx       # chosen template, coerced parameters, name availability
      DocOutlinePanel.tsx         # proposed doc paths + section headings
      OpenQuestionsList.tsx       # cited ambiguities the PRD left unresolved
      ApprovalBar.tsx             # approve/reject the whole blueprint
      ExecutionSummary.tsx        # created tickets, task ID, skipped and failed targets
    extensions/
      api.ts                      # ApiBlueprint.make(...)
      components.ts               # PageBlueprint.make(...)
    __tests__/
```

Frontend deltas vs `catalog-ai-insights`:

- `backstage.pluginId: 'scaffolder-ai-prd'`; package `@ai-crew-suite/plugin-agent-scaffolder-prd-backend`.
- Primary surface is a **standalone translator page** (nav item) via `PageBlueprint`. No `EntityCardBlueprint` — the component does not exist yet at PRD time.
- **`ChannelProgressPanel` is the defining surface**: three side-by-side lanes driven by node-tagged `step` events, so a user sees the PM, Engineer, and Writer working concurrently. If the `token.node` field lands, each lane also streams its own text; otherwise lanes show phase and status only.
- Approval is **all-or-nothing over the whole blueprint**, matching the backend's single gate. Per-item approval is deliberately not offered, because partial approval would fracture the `blueprintHash` idempotency contract.
- `ExecutionSummary` must render `skipped` and `failures` as prominently as successes: after a `partially_committed` outcome the user needs to know precisely which tickets exist. This is the UI half of the no-rollback decision.
- Every derived item shows its `prd-N` citation, and `OpenQuestionsList` sits above the approval bar so unresolved ambiguity is seen before sign-off.
- `blueprint_only` (execution disabled) and `unparseable` render as first-class explained outcomes, not errors.

## Test Strategy

Reuse the `catalog-ai-insights` test-layer table (unit/contract/backend integration/runtime integration/LLM evaluation/full-stack E2E) and its network policies. Deltas only:

- **Unit (the highest-value layer here)**: `parse.ts` span segmentation, `maxSpans` capping, and the `unparseable` path. `merge.ts` — the foundation doc's second explicit test — assert all three channels populate a complete blueprint, cross-channel component-name rewriting, deterministic ordering, a stable `blueprintHash` across repeated merges, and that one empty channel yields `readiness: 'partial'` plus a named limitation rather than a throw. `blueprint.ts` dropping uncited items. `commit.ts` write-plan ordering and idempotency skip logic (pure, with injected fakes).
- **Node tests**: each node in isolation with a stubbed tool runner — `productManager` dedupe probe hit vs miss; `engineer` ranking, schema coercion, and name-collision issue; `technicalWriter` extending existing docs rather than duplicating. Assert each node writes **only** its own channel.
- **Workflow (runtime) tests**: drive `PrdGraph.run()` with a stubbed `WorkflowContext` (`invokeTool` mock router keyed by `toolId` + args) plus fake `scaffolderService`/`catalogClient` — the codebase-accurate replacement for the foundation doc's `jira.service`/`scaffolder.service` `createServiceRef` sketches. **Headline scenario (the foundation doc's own test)**: post "Build a multi-factor auth system using our node template" → assert all three nodes execute (three distinct node-tagged `step` sequences), the merged blueprint has `epic`, `template`, and `documentation` populated, the run **suspends** at `approval_request`, and **neither `project.ticket.create` nor `scaffold()` was called**.
- **Concurrency/merge-integrity tests**: run the fan-out with nodes resolving in different orders (and with artificial delays) and assert the merged blueprint is byte-identical — proving order-independence. Then fail one node and assert the other two still merge with a limitation.
- **Commit tests** (resume path): `resume('approved')` creates the epic first, then each story with `parentId` equal to the epic's returned ID, then the task — assert call order and arguments. A story failure mid-loop yields `partially_committed` with exact `storyTicketIds` and `failures`, and **no rollback attempt**. A repeated approved resume creates nothing new (idempotent by `(blueprintHash, target)`). `resume('rejected')` calls nothing.
- **Gate hardening**: assert no write occurs when the model hallucinates a tool call or attempts to skip the gate; with `execute.enabled: false` a valid blueprint terminates `blueprint_only` and `project.ticket.create` is never invoked.
- **Degradation tests**: no project-management driver → PM channel unavailable, ticket targets `skipped`, blueprint still emitted; no VCS write tool → documentation always `skipped` with the documented reason.
- **`knowledge.retrieve` isolation**: pre-baked precedent chunks; assert blueprint structure is identical with retrieval on and off, and that an item citing only `kb-N` is dropped.
- **Backend integration**: `startTestBackend` with this module + AI Core + `mockServices.rootConfig` + `mockServices.database`, plus stub `scaffolderServiceRef`/`catalogServiceRef`, asserting boot registration, per-node SSE ordering, checkpoint at the gate, resume flow, and blueprint/execution artifact persistence.
- **E2E**: extend the shared fixture profile with fixture templates, a fixture ticket driver, and a fixture docs repo. Playwright: paste a PRD → watch three channels progress → review the merged plan → approve → assert the execution summary lists the epic, stories, and task; plus a reject path and a partial-failure path. Add `yarn test:e2e:scaffolder-ai-prd`.

## Security and Operational Guardrails

`catalog-ai-insights` guardrails apply unchanged (identity propagation, redaction before model/SSE/artifacts, tool/token/wall-clock caps, correlation IDs). PRD-specific additions:

- **No external write before a persisted approval**, and `execute.enabled` defaults to `false`. Approval, `approvedBy`, `blueprintHash`, and every created ID are audit-logged; rejections are audited too.
- **Two independent write barriers**: ticket creation is an `effect: 'write'` tool (gated by AI Core's approval policy) and the scaffolder task is an injected service reachable only from `commit.ts` on the resume path. No model action can trigger either.
- Commits run with the **approver's** credentials so Jira/Scaffolder permission checks apply; the agent cannot create work in a project the approver cannot write to.
- **A partial commit is reported, never hidden.** `failures` and `skipped` are first-class artifact fields, because silently succeeding on 3 of 8 stories is an operational trap.
- PRD text is **untrusted input**: cap `maxPrdChars`, delimit it in every node prompt with an instruction not to follow embedded directives, and never let it introduce template fields absent from the real schema or expand the ticket cap.
- Redact secret-shaped strings from PRD spans before they reach the model, SSE, artifacts, or created ticket descriptions — PRDs frequently paste credentials or internal URLs.
- Uncited items are dropped, not published: no epic, story, template parameter, or doc file reaches the blueprint without a `prd-N` (or schema/default) origin, so the agent cannot invent scope.
- Cap concurrent node tool usage with a shared `maxToolInvocations` budget so three parallel nodes cannot together exceed the run's cost envelope.

## Ordered Implementation Milestones

### Milestone 0: Contracts and pure engines

- [ ] Add `@backstage/plugin-scaffolder-node` to this package; confirm `scaffolderServiceRef`, `project.ticket.create` + `CreateTicketInput`, and the `catalogServiceRef` adapter shape. Decide on the `token.node` core addition.
- [ ] Define `PrdRequest`, `PrdSpan`, `EpicBlueprint`, `StoryBlueprint`, `TemplateBlueprint`, `DocumentationBlueprint`, `DeliveryBlueprint`, `DeliveryExecution`, and the config schema.
- [ ] Implement + unit-test `parse.ts`, `merge.ts`, `blueprint.ts`, and the `commit.ts` write-plan builder (pure, no I/O).

Exit criteria: merge determinism, cross-channel rewriting, a stable `blueprintHash`, and write-plan ordering all pass on fixtures.

### Milestone 1: Fan-out backend (read-only, blueprint only)

- [ ] Scaffold the package with a barrel `index.ts` in every directory, register the runner/agent/manual trigger, config parsing; register in root `tsconfig.json` + `.eslintrc.cjs`.
- [ ] Implement the three nodes plus `Promise.all` fan-out with per-node `step` events, following `ReviewGraph.ts`; wire `TemplateResolver`, `TicketPlanner` (read paths), and `PrdCatalogResolver`.
- [ ] Wire into `packages/backend` (after `plugin-scaffolder-backend`) and add the `ai.agents.scaffolderPrd` config block.
- [ ] Add unit, node-isolation, concurrency/merge-integrity, workflow-scenario, and backend integration tests.

Exit criteria: the foundation doc's multi-factor-auth PRD produces a complete three-channel blueprint deterministically, with no real LLM and no external writes.

### Milestone 2: Approval gate and transactional commit

- [ ] Implement the gate + `PrdGraph.resume()`: checkpointed blueprint, `approval_request`, ordered commit (epic → stories → task), partial-failure recording, `(blueprintHash, target)` idempotency, and per-target audit.
- [ ] Commit-path tests including ordering, mid-loop failure, double-resume, rejection, and `execute.enabled: false`.

Exit criteria: writes occur only after approval, in dependency order, exactly once, with partial outcomes reported precisely.

### Milestone 3: Frontend and E2E

- [ ] Scaffold the empty frontend package (`ApiBlueprint` + `PageBlueprint`, submit form, three-lane channel panel, epic/story tree, template panel, doc outline, open questions, approval bar, execution summary) with barrel indexes, and register it in `packages/app`.
- [ ] Component tests (loading, three-lane streaming, complete/partial readiness, blueprint_only, awaiting approval, committed, partially_committed, declined, replay) plus accessibility checks.
- [ ] Extend the E2E fixture profile and add Playwright approve, reject, and partial-failure scenarios with screenshot review.

Exit criteria: `yarn test:e2e:scaffolder-ai-prd` demonstrates PRD → three channels → merged plan → approve → execution summary, plus reject and partial paths, in a browser without external infrastructure.

### Milestone 4: Production readiness

- [ ] Document model registration, template allow-list curation, ticket driver configuration, execution enablement, approver permissions, and the no-rollback partial-commit behavior.
- [ ] Dashboards/alerts for blueprint volume by readiness, per-channel failure rate, approval/rejection ratio, **partial-commit rate**, and token cost per PRD (three nodes make this the most expensive agent in the suite).
- [ ] Opt-in real-model evaluation suite (grounding: every epic/story/parameter/doc path cites a `prd-N` span; no invented scope, owners, or estimates; template parameters are all schema-declared) within budget.

Exit criteria: staged rollout with execution disabled by default, bounded per-PRD cost, and verified citation grounding.

## Backend Completed

- AI Core backend module:

  - Agent: `scaffolder-ai-prd`
  - Workflow: `scaffolder-prd`
  - Manual trigger
  - Sessionless execution
  - Read-only enrichment tool allow-list reserved for future milestones

- Required configuration:

  - `ai.agents.scaffolderPrd.model`
  - non-empty `templates.allowed`
  - PRD character and story caps
  - execution flag retained, but no commit behavior is enabled

- Deterministic blueprint-only flow:

  1. Validates an inline, versioned PRD request.

  2. Splits bounded PRD text into cited `prd-N` spans.

  3. Emits PM, Engineer, and Writer step lanes.

  4. Runs deterministic channel construction through `Promise.all`.

  5. Produces:

     - cited epic
     - cited stories
     - allow-listed template selection
     - cited documentation outline

  6. Merges channels into a stable `DeliveryBlueprint`.

  7. Computes a deterministic SHA-256 `blueprintHash`.

  8. Emits a replayable `delivery-blueprint` artifact.

### Safety and scope behavior

Every generated blueprint item retains PRD evidence. The current implementation does not claim unsupported behavior:

- No external ticket reads or duplicate-epic probing.
- No live template-schema lookup or catalog validation.
- No documentation repository reads.
- No approval/checkpoint/resume flow.
- No ticket creation.
- No Scaffolder task creation.
- No documentation publishing.

The generated artifact carries explicit limitations for all deferred functionality.

### Test coverage

Added a workflow scenario that verifies a multi-factor-auth PRD yields:

- complete three-channel blueprint
- configured template selection
- two cited stories
- cited documentation outline
- `blueprint_only` status
- no external writes

### Registration updated

- `/home/kevin/Repos/backstage/ai-crew-suite/tsconfig.json`
- `/home/kevin/Repos/backstage/ai-crew-suite/.eslintrc.cjs`
- `/home/kevin/Repos/backstage/ai-crew-suite/packages/backend/package.json`
- `/home/kevin/Repos/backstage/ai-crew-suite/packages/backend/src/index.ts`
- `/home/kevin/Repos/backstage/ai-crew-suite/app-config.yaml`
- `/home/kevin/Repos/backstage/ai-crew-suite/yarn.lock`

## Definition of Done

- Package, agent, runner (`run` + `resume`), manual trigger, config schema, and the tool allow-list implemented and registered (root + backend/app wiring included), with a barrel `index.ts` in every directory.
- Runs execute through the real AI Core controller/runtime with persisted replayable events, per-node `step` attribution, a checkpoint at the gate, and `delivery-blueprint` / `delivery-execution` artifacts.
- The three nodes run concurrently via `Promise.all` into single-writer channels; `merge.ts` is pure, total, and order-independent, producing a stable `blueprintHash`.
- Every blueprint item cites a `prd-N` span (or a schema/default origin); uncited model output is dropped rather than published.
- No ticket, task, or document write occurs before a persisted approval; commits run in dependency order with the approver's credentials, are idempotent per `(blueprintHash, target)`, and report partial outcomes in `failures`/`skipped` without attempting an impossible rollback.
- A failing or unconfigured channel degrades to a limitation and a `partial` blueprint rather than aborting the run.
- Frontend renders three live channels, the merged plan, and approval over SSE and replay via `ApiBlueprint`/`PageBlueprint`; Playwright verifies approve, reject, and partial-failure paths on fixtures.
- No output surface (SSE, artifacts, logs, audit, tests, created tickets) contains secrets, uncited scope, invented estimates, or a write lacking a recorded human approval.
