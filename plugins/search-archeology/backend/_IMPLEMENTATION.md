# Search AI Archeology Implementation Plan

## Overview

This plugin acts as a semantic search engine across deprecated spaces, legacy wikis, and historical repositories, digging up context and documentation that keyword search engines miss.

- **The Task**: Identifying active subject matter experts and uncovering lost historical tribal knowledge across shifting organizational structures.
- **The Logic**: Instead of running expensive, noisy vector embeddings over millions of historical code diffs, a **Multi-Tool Research Agent** executes a hybrid search. It uses `knowledge.retrieve` over high-level TechDocs and Architecture Decision Records (ADRs) to isolate target files and components. It then invokes time-bounded queries via the **GitHub and Jira tool packs** (e.g., historical `git blame` logs and ticket histories from specific eras) to calculate an **Expertise Matrix Artifact**, tracking down the original authors and code reviewers regardless of current catalog ownership.

## Goal

Implement `@ai-crew-suite/plugin-agent-search-archeology-backend` as an AI Core backend module that answers *"who actually knows this legacy system?"* It runs a **hybrid** research workflow rather than embedding millions of diffs: `knowledge.retrieve` over TechDocs/ADRs isolates the relevant files and components, deterministic time-bounded VCS and ticket queries surface the humans who wrote, reviewed, and triaged that code, and the Backstage Org Graph translates stale commit identities into **currently active** teams. The output is a cited `ExpertiseMatrix` that ranks living experts and explicitly labels offboarded contributors rather than dropping or fabricating them. A paired frontend plugin renders the research timeline, the matrix, and its citations.

Reuse the architecture proven by `plugin-ai-agent-backend-catalog-ai-insights` (its `_IMPLEMENTATION.md` is the source of truth for repository conventions, workflow-runner mechanics, event contracts, monorepo wiring, and test-layer definitions). This plan documents only what differs: **hybrid retrieval-then-history research**, **historical identity resolution**, **deterministic expertise ranking**, and **rate-limit-resilient resumable deep runs**.

## Delivery Boundary

### In scope

- One research question per session, scoped to a component/repo/topic plus a bounded era, via `/agents/search-ai-archeology/runs`.
- Deterministic `scope → retrieve → history → resolve → rank → report` graph. Evidence collection, identity resolution, and expert ranking are pure code; the model only summarizes cited evidence and phrases the narrative.
- Bounded reads: `knowledge.retrieve` over TechDocs/ADRs, `vcs.repository.search`/`read_file` for target isolation, `project.ticket.search`/`get` for triage history, and the `CatalogEntityResolver` for org-graph mapping.
- An `ExpertiseMatrix` artifact where every ranked person cites the specific commits, PRs, or tickets that justify their score.
- **Explicit identity outcomes**: `active`, `moved_team`, `offboarded`, or `unresolved` — never a silent drop and never an invented person.
- Per-node progress streaming so a long research run is legible, plus checkpoint/resume across third-party rate limits.

### Explicitly out of scope for v1

- **Any write.** No tickets, messages, catalog edits, or PRs. This is a read-only research agent; there is no approval gate because there is nothing to approve.
- Contacting the identified experts. The matrix is surfaced in the portal; reaching out is a human decision (and `communication.message.post` is deliberately not allow-listed).
- Bulk embedding of historical code diffs — explicitly rejected by the foundation doc as expensive and noisy. Retrieval covers prose (docs/ADRs); code history is queried deterministically.
- Performance review or productivity metrics. Scores rank *evidence of familiarity with this code*, not individual merit, and the plan says so where it could be misread.
- Cross-repo portfolio archeology; one component/repo scope per run.
- Line-level blame attribution in v1 — the required VCS op does not exist (see Prerequisites), so v1 ranks from PR/review/ticket evidence and records the limitation.

## Required Prerequisites

Contracts verified against the current codebase. As with the catalog plan: no fictional service refs — the foundation doc's `github.service` sketch (`getFileBlameHistory`) must **not** be implemented as written.

**Luna's gate is confirmed, and it is the plugin's main constraint.** `VcsDriver` exposes exactly four ops — `getRepositoryMetadata`, `readFile`, `searchRepository`, `listPullRequests` — and the registered tools are only `vcs.repository.get_metadata`, `vcs.repository.read_file`, `vcs.repository.search`, `vcs.pull_request.list`. There is **no blame, commit-log, or history operation anywhere**, and `listPullRequests` accepts only `repoUrl` (no time window, no state filter, no reviewers). The foundation doc's central signal — historical authorship — is therefore not obtainable today.

**Correction to the earlier draft, in the other direction:** the "shared catalog identity resolver" is **no longer missing**. `CatalogEntityResolver` has landed in `plugin-ai-core-node/src/catalog/` with `getEntitySummary`, `findByAnnotation`, `getRelations`, and `getIntegrationReferences`. It does **not** expose an email→`User` lookup, which is exactly the primitive this plugin needs — so the work is a small, well-scoped *extension* of an existing contract rather than building one from scratch.

| Capability | Required contract | Current state | Required action |
| --- | --- | --- | --- |
| Doc/ADR semantic search | `knowledge.retrieve` | **Exists** (registered in the AI Core factory, `effect: 'read'`, args `{ query, source, entityFilter? }`) | Primary target-isolation step. Scope by `entityFilter`; cap `topK`. This is the cheap half of the hybrid strategy. |
| Target file isolation | `vcs.repository.search`, `vcs.repository.read_file` | **Exist**, `effect: read` | Locate files named by retrieved docs/ADRs; read bounded excerpts for context. |
| Structural scan | `coreServices.urlReader` | Exists, used across the VCS modules | Check for a `/docs/adr/` tree or root config, as the foundation doc's first node describes. |
| **Commit/blame history (blocking for authorship)** | A provider-neutral history op, e.g. `vcs.repository.list_commits({ repoUrl, path, since, until })` → `{ sha, author: ServiceActor, date, path }[]`, registered as `vcs.repository.list_commits` (`effect: 'read'`) | **Not present** — `VcsDriver` has no commit/blame/log op; the four registered `vcs.*` tools cover metadata, file read, search, and PR list only | Add the driver op + tool with a **required** `TimeRange` so an agent cannot issue an unbounded history query against a metered API. Implement for GitHub first; other providers degrade with a limitation. **Blocking for author-based ranking.** |
| **Review participation (partially blocking)** | Time-bounded, state-inclusive PR listing with reviewers: `listPullRequests(repoUrl, { path?, since?, until?, state? })` plus `reviewers?: ServiceActor[]` on `PullRequestSummary` | **Insufficient** — `listPullRequests(repoUrl)` takes no window/filter, and `PullRequestSummary` carries only `author?: string` with no reviewers | Extend the driver signature (optional args, backward compatible) and add `reviewers` to `PullRequestSummary`. Without this, review evidence is unavailable and only ticket evidence remains. |
| Ticket triage history | `project.ticket.search`, `project.ticket.get` | **Exist**, `effect: read`. `TicketDetail` carries `comments: TicketComment[]` (each with `author: ServiceActor`) and **`assigneeHistory: TicketAssigneeChange[]`** — whose doc comment literally cites "archeology-style agents that trace ownership loops" | The richest signal available **today**, and the reason v1 is viable before the VCS work lands. |
| Era-bounded ticket queries | `TicketSearchQuery` including a `TimeRange` | **Missing** — it has `text`/`team`/`assignee`/`states`/`labels`/`limit` but does **not** extend `TimeRange`, unlike `AlertHistoryQuery` and `IncidentSearchQuery` | Add `TimeRange` to `TicketSearchQuery`, consistent with the other history queries. Until then, filter client-side by ticket timestamps and record the over-fetch as a limitation. |
| Org-graph identity mapping | `CatalogEntityResolver` + an **email→User** lookup | **Partially exists** — the resolver landed with `getEntitySummary`/`findByAnnotation`/`getRelations`/`getIntegrationReferences`, but **no** email/profile lookup | Add `findUserByEmail(email)` (or a generic `findByField`) to the resolver, plus `memberOf` traversal via `getRelations`. This is the foundation doc's `active-lead@company.com` → `team-core-infra` path. |
| Offboarded-account handling | Absence of a `User` entity | **Exists as a natural signal** — the foundation doc's fixture deliberately omits `retired-dev` | An unresolvable identity is a **first-class `offboarded` outcome**, never an exception and never dropped. |
| Rate-limit resilience | `CheckpointStore` + `WorkflowRunner.resume()` | **Exist** | Checkpoint after each evidence-collection page so a `429` resumes at the exact node boundary (the foundation doc's §2 requirement) without re-running completed retrieval. |
| Session continuity | AI Core session memory + runtime stores | Exist | Iterative follow-up questions continue one research session. |
| Scheduler | — | Available but **unused** | Archeology is user-initiated research; there is no background path and therefore no scheduler section in this plan. |

## Package Shape

Backend module from the same template as `catalog-ai-insights`; only the domain directories differ. Every directory carries a barrel `index.ts` re-exporting its public surface, matching the reference plugin's export styling.

```text
plugins/backend/plugin-ai-agent-backend-search-ai-archeology/
  package.json          # role: backend-plugin-module, pluginId: ai-core
  tsconfig.json
  config.d.ts
  README.md
  src/
    index.ts            # barrel: module default + public types
    module.ts           # registers runner, agent, trigger
    agent.ts            # SEARCH_ARCHEOLOGY_AGENT_ID, tool allow-list, system prompt
    config.ts           # readSearchArcheologyConfig (ai.agents.searchArcheology)
    workflow/
      index.ts          # barrel
      ArcheologyGraph.ts        # WorkflowRunner id 'knowledge-archeology' (run + resume)
      state.ts                  # ArcheologyState (scope, evidence, cursor, identities)
      scope.ts                  # pure: request -> bounded ResearchScope + era window
      history.ts                # VCS/ticket evidence collection, page-checkpointed
      identity.ts               # pure: raw actors -> ResolvedIdentity[] via org graph
      rank.ts                   # pure: evidence -> ranked ExpertRecord[]
      matrix.ts                 # ExpertiseMatrix schema, validation, degradation
    retrieval/
      index.ts          # barrel
      DocRetriever.ts           # knowledge.retrieve wrapper: entityFilter, topK cap
      targetIsolation.ts        # pure: retrieved chunks -> candidate file/component set
    services/
      index.ts          # barrel
      OrgGraphResolver.ts       # CatalogEntityResolver adapter incl. email -> User -> Group
      HistoryToolRunner.ts      # capped invokeTool facade with 429-aware truncation
      ArcheologyArtifactWriter.ts
    @types/
      index.ts          # barrel: shared request/matrix contracts
    __tests__/
    workflow/__tests__/
    retrieval/__tests__/
    services/__tests__/
```

- `createBackendModule` with `pluginId: 'ai-core'`, `moduleId: 'agent-search-ai-archeology'`.
- `module.ts` deps: `coreServices.rootConfig`, `coreServices.logger`, `coreServices.urlReader`, `coreServices.discovery`, `coreServices.auth`, `catalogServiceRef`, plus `agentExtensionPoint`, `triggerExtensionPoint`, `workflowRunnerExtensionPoint`. **No new core service keys are introduced**; `coreServices.scheduler` is intentionally unused.
- Package naming, scripts, Apache header, root `tsconfig.json` references, and `.eslintrc.cjs` role overrides follow `catalog-ai-insights` and `plugin-registration.md` verbatim (not repeated here).

## Monorepo And App Wiring

Same delegated-but-verified steps as `catalog-ai-insights` (see that plan's "Monorepo And App Wiring"). Deltas:

- **Backend load**: add `"@ai-crew-suite/plugin-agent-search-archeology-backend": "workspace:^"` to `packages/backend/package.json` and the matching `backend.add(loadBackendFeature(import(...)))` line in `packages/backend/src/index.ts`.
- **Driver gates, all soft**: retrieval needs the retrieval-augmenter + a vector store; ticket evidence needs `plugin-ai-core-backend-module-project-management` plus its Jira driver; VCS evidence needs the VCS module plus a provider driver. Every absence degrades the matrix with a named limitation instead of failing the run — this agent is useful even on retrieval alone, which is why no gate is hard.
- **Core edits touch shared packages**: adding `list_commits` to `VcsDriver`, `reviewers` to `PullRequestSummary`, `TimeRange` to `TicketSearchQuery`, and `findUserByEmail` to `CatalogEntityResolver` all modify `plugin-ai-core-node`. Run `yarn typecheck --force` / `yarn lint --force` afterward, and keep each addition optional/additive so existing drivers still compile.
- **App config**: the module throws at boot without `ai.agents.searchArcheology.model`; add the config block (see Configuration) before enabling the load.
- **Frontend registration**: `plugins/frontend/plugin-ai-agent-frontend-search-ai-archeology/` exists but is **empty** — scaffold it from scratch. Add the workspace dependency to `packages/app/package.json`, import its `/alpha` default export in `packages/app/src/App.tsx`, and extend plugin-ID expectations in `packages/app/src/App.test.tsx`.
- **Yarn PnP refresh**: `yarn install` after any `package.json` edit.
## Agent Definition

```ts
{
  id: 'search-ai-archeology',
  modelRef: config.modelRef,          // installation-registered ID, e.g. 'search-archeology'
  workflowRef: 'knowledge-archeology',
  memory: 'session',                  // iterative research: follow-ups refine one investigation
  systemPrompt: SEARCH_ARCHEOLOGY_SYSTEM_PROMPT,
  toolIds: [
    'knowledge.retrieve',
    'vcs.repository.search',
    'vcs.repository.read_file',
    'vcs.pull_request.list',
    'vcs.repository.list_commits',    // NEW (see Prerequisites); omit until it lands
    'project.ticket.search',
    'project.ticket.get',
  ],
  triggers: [
    { id: 'archeology-research-on-demand', source: 'manual', agentId: 'search-ai-archeology' },
  ],
}
```

- **Every tool is `effect: 'read'` and there is no write tool at all** — hence no approval gate anywhere in this plugin. That is a deliberate design property, not an omission.
- Catalog/org-graph access goes through the injected `CatalogEntityResolver` adapter rather than a tool, matching the landed core contract.
- `vcs.repository.list_commits` does not exist yet; omit it from the allow-list until it lands (an unknown ID fails fast at boot). The workflow then runs on PR + ticket + retrieval evidence and records `commit history unavailable` as a limitation.
- `memory: 'session'` because archeology is iterative: "who knows the auth module?" is naturally followed by "what about just the token refresh path?", and the second question should refine the first rather than restart it.
- System prompt rules: the expert ranking, scores, and identity statuses are supplied **pre-computed** and must be quoted verbatim; never invent a person, email, team, commit SHA, PR number, or ticket key; cite `doc-N`/`commit-N`/`pr-N`/`ticket-N`/`org-N` evidence IDs for every claim; describe an `offboarded` contributor as a historical contributor and never imply they are reachable; never characterize a person's skill, seniority, or performance — only their traceable involvement with this code; when evidence is thin, say the matrix is inconclusive.

## Run Input Contract

The generic `AgentRunInput.input.query` carries a versioned JSON payload:

```ts
type ArcheologyRequest = {
  version: 1;
  source: 'manual';
  question: string;              // required, 'who knows the legacy billing reconciler?'
  entityRef?: string;            // component to scope retrieval + repo discovery
  repoUrl?: string;              // explicit repo override
  paths?: string[];              // known target files, skipping isolation
  era?: { since?: string; until?: string };  // ISO-8601; defaults to config lookbackYears
  sessionId?: string;            // continue an existing investigation
  cursor?: string;               // resume an interrupted deep run
};
```

Validation requires a non-empty `question` capped at `maxQuestionChars`, requires `entityRef` **or** `repoUrl` (a question with no scope is refused rather than searched globally), clamps `era` to `maxLookbackYears`, and caps `paths`.

## Archeology Workflow

`ArcheologyGraph` registers as `WorkflowRunner` id `knowledge-archeology` and implements **both** `run()` and `resume()` — the latter for rate-limit recovery, not approval. It realizes the foundation doc's network: **Isolate Target Files → Query Historical Logs → Cross-Reference Org Graph → Generate Expertise Matrix**. Evidence collection, identity resolution, and ranking are deterministic; the model narrates.

### Deterministic graph nodes

1. **scope** — validate `ArcheologyRequest`; `scope.ts` resolves the repo (explicit `repoUrl`, or the `source-location` annotation via `getIntegrationReferences`) and computes the bounded era window. `coreServices.urlReader` probes for a `/docs/adr/` tree. No resolvable repo **and** no retrieval source → terminal `out_of_scope` with no model call.
2. **retrieve** — `DocRetriever` runs `knowledge.retrieve` over TechDocs/ADRs scoped by `entityFilter`, capped at `topK`. `targetIsolation.ts` (pure) turns retrieved chunks into a candidate set of file paths and component names (`doc-N` evidence), optionally confirmed via `vcs.repository.search`. This is the **cheap** half of the hybrid: prose narrows the expensive history queries to a handful of paths.
3. **history** — for each candidate path, collect evidence through `HistoryToolRunner`: `vcs.repository.list_commits` when available (`commit-N`), `vcs.pull_request.list` filtered to the era (`pr-N`), and `project.ticket.search`/`get` for tickets naming the component — mining `comments[].author` and **`assigneeHistory`** for triage participation (`ticket-N`). **The cursor is checkpointed after every page**, so a `429` loses at most one page. Rate limits are treated as truncation, not failure.
4. **resolve** — `identity.ts` (pure) normalizes every collected `ServiceActor` into a `ResolvedIdentity` using `OrgGraphResolver`: email → `User` → `memberOf` → `Group`. Four outcomes, all explicit — `active` (User exists, team resolved), `moved_team` (User exists, now in a different group than the evidence era suggests), `offboarded` (no `User` entity — the foundation doc's `retired-dev`), `unresolved` (no email or ambiguous match). Legacy email domains are normalized via configured aliases before lookup.
5. **rank** — `rank.ts` (pure, no LLM) scores each identity from weighted evidence: recency-decayed authorship, review participation, ticket triage depth, and current-ownership alignment. `active` identities always outrank `offboarded` ones at equal evidence weight, because the point is finding someone *reachable*. Produces the ordered `ExpertRecord[]`.
6. **report** — one model call writes the narrative and per-expert rationale from the supplied evidence only. `matrix.ts` re-validates that no person, team, or reference appears in the prose that is absent from the computed record, degrading to a fact-only matrix on violation. Emits the `expertise-matrix` artifact.

### State and output schema

```ts
type EvidenceRef = { id: string; source: 'doc' | 'commit' | 'pr' | 'ticket' | 'org'; summary: string; reference?: string };

type ResearchScope = {
  question: string;
  entityRef?: string;
  repoUrl?: string;
  paths: string[];               // isolated targets
  era: { since: string; until: string };  // always bounded
};

type ContributionEvidence = {
  id: string;                    // 'commit-1' | 'pr-1' | 'ticket-1'
  kind: 'authored' | 'reviewed' | 'triaged' | 'commented';
  actor: ServiceActor;           // raw provider identity, pre-resolution
  at: string;                    // ISO-8601
  path?: string;                 // file it applies to, when known
  reference?: string;            // SHA / PR number / ticket key
};

type ResolvedIdentity = {
  actor: ServiceActor;           // as seen in history
  status: 'active' | 'moved_team' | 'offboarded' | 'unresolved';
  userRef?: string;              // 'user:default/active-lead' when resolved
  displayName?: string;
  groupRefs: string[];           // current teams, from memberOf
  evidence: string[];            // org-N
};

type ExpertRecord = {
  identity: ResolvedIdentity;
  score: number;                 // deterministic, from weighted evidence
  signals: {                     // per-class counts feeding the score
    authored: number;
    reviewed: number;
    triaged: number;
    recencyMonths?: number;      // months since most recent contribution
  };
  rationale: string;             // model copy; must cite evidence IDs
  evidence: string[];            // commit-N / pr-N / ticket-N
};

// ArcheologyState: { request, scope?, docHits, evidence: ContributionEvidence[],
//   identities: ResolvedIdentity[], experts: ExpertRecord[], cursor?,
//   limitations: string[],
//   status: 'complete'|'partial'|'truncated'|'inconclusive'|'out_of_scope' }

type ExpertiseMatrix = {
  question: string;
  scope: ResearchScope;
  status: ArcheologyState['status'];
  experts: ExpertRecord[];       // ranked, active-first at equal weight
  offboardedContributors: ExpertRecord[];  // preserved, never dropped
  narrative: string;             // model summary, validated against the record
  confidence: 'high' | 'medium' | 'low';
  cursor?: string;               // set when truncated by rate limits or caps
  limitations: string[];         // e.g. 'commit history unavailable'
  evidence: EvidenceRef[];       // doc-N + commit/pr/ticket-N + org-N bundle
};
```

Status mapping is fixed in code, not inferred: all configured evidence sources available and at least one `active` expert → `complete`; one or more sources unavailable → `partial` with a named limitation; rate-limit or cap truncation → `truncated` with a `cursor`; evidence found but no identity resolvable → `inconclusive`; no repo and no retrieval source → `out_of_scope`. `confidence` is `low` whenever any limitation exists, the top expert's only signal is `triaged`, or the era window was clamped.

## Hybrid Retrieval-Then-History Strategy (New Structural Section)

The foundation doc explicitly rejects embedding millions of diffs, so the cost model is a first-class design concern rather than an afterthought.

- **Prose is embedded; code history is queried.** `knowledge.retrieve` runs only over TechDocs/ADRs — a small, slow-changing corpus — and its job is purely to narrow *which paths* deserve expensive history calls. No code diff is ever indexed.
- The narrowing is measurable: `targetIsolation.ts` caps candidates at `maxTargetPaths`, so history-query volume is bounded by config rather than repository size. A 500k-file monorepo and a 50-file service issue the same number of VCS calls.
- **Retrieval failure is survivable.** With no vector store the graph accepts caller-supplied `paths` (or falls back to `vcs.repository.search` on question keywords) and records a limitation. The reverse also holds: with no VCS driver, retrieval plus ticket evidence still produces a usable matrix. Both halves degrade independently.
- Retrieval **must never** name an expert. Chunks yield paths and component names only; person attribution comes exclusively from VCS/ticket actors resolved through the org graph. Tests assert the expert set is byte-identical with retrieval enabled and disabled given the same target paths.
- Per-source budgets (`maxRetrievalChunks`, `maxCommitsPerPath`, `maxPullRequests`, `maxTickets`) are enforced by `HistoryToolRunner`, so a deep dive cannot silently become a full-history crawl.

## Historical Identity Resolution (New Structural Section)

Mapping stale git identities to living humans is the plugin's genuine differentiator, and its most error-prone step.

- `identity.ts` is pure: `(actors, orgIndex, aliases) => ResolvedIdentity[]`. No AI Core, tool, or clock dependency, so every resolution branch is unit-testable against fixture org graphs.
- **Four explicit outcomes, no silent drops.** `offboarded` is a *result*, not an error — the foundation doc's fixture omits `retired-dev` precisely to test this. An offboarded contributor stays in the matrix under `offboardedContributors`, so the institutional trail survives even when the person does not.
- **Legacy email normalization** happens before lookup: configured `emailAliases` map historical domains (`@oldco.com` → `@company.com`) and handle `+`-suffixes and case. This is what stops a decade-old commit from being mis-labeled `unresolved`.
- `moved_team` matters as much as `active`: someone who wrote the module three years ago and now sits elsewhere is often the *best* person to ask, so the status is surfaced rather than collapsed into `active`.
- **Never fabricate an identity.** No `User` entity means no `userRef` and no team — the raw actor is preserved verbatim with `status: 'offboarded'`. A guessed team is worse than an acknowledged gap, because it sends a reader to the wrong people.
- Resolution respects the caller's identity: catalog reads propagate the requester's credentials, so the matrix cannot reveal `User` entities the caller may not read.

## Deterministic Expertise Ranking (New Structural Section)

A ranked list of *people* is socially consequential, so the scoring is code, visible, and deliberately narrow.

- `rank.ts` is pure and its weights are config-declared, so a reviewer can see exactly why someone ranked first. The model never orders the list.
- Signal weighting reflects reachability: `active` > `moved_team` > `offboarded` at equal evidence, and recency decay means a 2025 reviewer outranks a 2019 author. This directly encodes the foundation doc's requirement that `active-lead` be the prime expert while `retired-dev` is recorded as a legacy contributor.
- **Review and triage count, not just authorship.** A reviewer who approved twelve PRs on a file often understands it better than someone who made one large commit, and `assigneeHistory` captures whoever repeatedly owned its incidents.
- Scores are **evidence counts, not merit judgments.** `ExpertRecord.signals` exposes the raw counts feeding each score so the number is auditable, and the system prompt forbids any characterization of skill or performance. This plugin must not become a productivity-metrics tool.
- Ties break deterministically (recency, then evidence count, then stable ref ordering) so two runs over identical evidence produce identical rankings.
- Thin evidence yields `inconclusive` rather than a confidently-ranked single commit author — the honest answer when the knowledge really is lost.

## Rate-Limit Resilience And Resumable Runs (New Structural Section)

The foundation doc's §2 requirement is that a mid-run `429` must not lose collected work.

- The **cursor is checkpointed after every evidence page**, keyed by `(path, source)`, so a failure loses at most one page rather than the whole crawl.
- `HistoryToolRunner` classifies errors: `429`/timeout → **retryable truncation** (emit a partial matrix plus cursor, status `truncated`); auth/not-found → per-source limitation with other sources continuing; unexpected → surfaced as a run error. Only the first is resumable, and the distinction is explicit in code.
- `resume(runId, decision, context)` re-enters at the **history** node with accumulated evidence intact and never re-runs `retrieve` — completed retrieval is the expensive part to preserve, exactly as the foundation doc requires.
- Resumption is **not** an approval path: this plugin has no write and no gate. `resume()` exists solely for continuation, which keeps its semantics simple and its tests unambiguous.
- Bounded on three axes — per-source budgets, `maxToolInvocations`, and a wall-clock budget — so a deep dive degrades to `truncated` rather than hanging a user-facing request.
- Truncated runs surface the cursor in the UI so a user can explicitly continue, rather than silently receiving a partial answer presented as complete.

## Vector Store Integration

- **No new vector infrastructure**, and deliberately **no new indexing**: the corpus is the existing TechDocs/ADR content already owned by `plugin-ai-core-backend-module-retrieval-augmenter` and the pgvector/qdrant modules. Session/checkpoint state lives in `plugin-ai-core-backend-module-runtime-store`.
- **Never index personal data.** Commit authors, resolved identities, emails, and the matrix itself must not be embedded or written to vector storage — they live only in the run artifact. Indexing "who knows what" would create a durable people-profile store nobody consented to, and this plan forbids it explicitly.
- Retrieval is scoped by `entityFilter` to the component under study, so a research question cannot vacuum unrelated documentation into context.

## Configuration

```yaml
ai:
  agents:
    searchArcheology:
      model: search-archeology      # installation-registered model ID, required
      maxQuestionChars: 500         # optional, default 500
      maxLookbackYears: 5           # optional, default 5 (clamps the era window)
      maxTargetPaths: 10            # optional, default 10 isolated paths
      maxRetrievalChunks: 12        # optional, default 12
      maxCommitsPerPath: 50         # optional, default 50
      maxPullRequests: 50           # optional, default 50
      maxTickets: 40                # optional, default 40
      maxToolInvocations: 24        # optional, default 24 (deep research needs headroom)
      runTimeoutSeconds: 300        # optional, default 300 wall-clock budget
      retrieval:
        source: techdocs            # optional, default 'techdocs'
        adrPaths: ['docs/adr', 'docs/decisions']  # optional structural probe targets
      identity:
        emailAliases:               # optional legacy-domain normalization
          '@oldco.com': '@company.com'
        treatUnresolvedAsOffboarded: false  # optional, default false (keep distinct)
      ranking:
        weightAuthored: 3           # optional, default 3
        weightReviewed: 2           # optional, default 2
        weightTriaged: 1            # optional, default 1
        recencyHalfLifeMonths: 18   # optional, default 18 decay half-life
        activeBonus: 2              # optional, default 2 (favors reachable people)
        maxExperts: 10              # optional, default 10 ranked entries
```

`config.ts` mirrors `readCatalogAiInsightsConfig`: throw when the section or `model` is absent; document every default in `config.d.ts`. Validate at boot that ranking weights are non-negative and `recencyHalfLifeMonths > 0`, since a zero half-life would silently erase all historical evidence.

## Shared AI-Core Work To Build First

- **`vcs.repository.list_commits` (blocking for authorship ranking)** — add a commit/blame-style op to `VcsDriver` with a **required** `TimeRange`, returning `{ sha, author: ServiceActor, date, path }[]`, and register it as a `ToolDefinition` (`effect: 'read'`). GitHub first; other drivers may throw a typed "unsupported" that the runner converts to a limitation. Generic enough to serve any future history-oriented agent.
- **PR listing needs a window and reviewers** — extend `listPullRequests(repoUrl, opts?)` with optional `{ path?, since?, until?, state? }` and add `reviewers?: ServiceActor[]` to `PullRequestSummary`. Both additive, so existing callers (`oncall-ai-handover-assistant`, `release-notes-ai-generator`) keep compiling.
- **`TicketSearchQuery` should extend `TimeRange`** — every other history query in core (`AlertHistoryQuery`, `IncidentSearchQuery`) already does; tickets are the outlier. This is a one-line type change plus driver mapping, and it removes this plugin's client-side over-fetch.
- **`CatalogEntityResolver.findUserByEmail(email)`** — the resolver has landed but lacks the profile lookup this plugin needs. Add it (or a generic `findByField`) to `plugin-ai-core-node/src/catalog/`, with the pure mapping unit-tested per the module's existing convention. Useful to any agent resolving third-party actors to Backstage users.
- **No new ranking, checkpoint, or session machinery** — `scope.ts`/`identity.ts`/`rank.ts`/`targetIsolation.ts` are plugin-local pure modules; checkpoints, `resume()`, session memory, and runtime stores all exist and are exercised as-is.

## Frontend Plan

Mirror the `catalog-ai-insights` frontend layout and wiring exactly: `alpha.ts` composing extensions into a `createFrontendPlugin` `FrontendFeature`, `extensions/api.ts` using `ApiBlueprint.make({ params: defineParams => defineParams(createApiFactory({...})) })`, `extensions/components.ts` using `PageBlueprint.make({ name, params: { path, title, routeRef, loader } })` with lazy `import(...)` loaders, self-contained wire types in `@types/`, and an SSE client over `discoveryApi.getBaseUrl('ai-core')` with `eventsource-parser` and `Last-Event-ID` replay. Every directory carries a barrel `index.ts`. The package directory exists but is **empty** — scaffold it from scratch.

```text
plugins/frontend/plugin-ai-agent-frontend-search-ai-archeology/
  src/
    index.ts                      # barrel: public components/api/types
    alpha.ts                      # createFrontendPlugin: pluginId + extensions
    plugin.ts                     # legacy-system plugin + routable extension
    routes.ts                     # ROOT_PATH + rootRouteRef
    @types/
      index.ts                    # ArcheologyRequest/ExpertiseMatrix wire types
    api/
      index.ts                    # barrel
      apiRef.ts                   # searchArcheologyApiRef
      client.ts                   # SearchArcheologyClient: research(), continueRun(), streamRunEvents(), listMatrices()
    hooks/
      index.ts                    # barrel
      useArcheologySession.ts     # pure reducer + hook (research/continue/refine/reset)
    components/
      index.ts                    # barrel
      ArcheologyPage.tsx          # standalone: question entry + past investigations
      ResearchQueryForm.tsx       # question + entity/repo scope + era window
      InvestigationTimeline.tsx   # live per-node progress from SSE (the "dig" view)
      ExpertiseMatrixTable.tsx    # ranked experts: name, team, score, signals
      IdentityStatusBadge.tsx     # active / moved_team / offboarded / unresolved
      EvidenceCitationList.tsx    # per-expert commits, PRs, tickets as deep links
      SignalBreakdown.tsx         # authored/reviewed/triaged counts behind a score
      TruncationBanner.tsx        # rate-limited/truncated + continue affordance
      EntityArcheologyCard.tsx    # optional entity-page card: "who knows this?"
    extensions/
      api.ts                      # ApiBlueprint.make(...)
      components.ts               # PageBlueprint.make(...) + EntityCardBlueprint.make(...)
    __tests__/
```

Frontend deltas vs `catalog-ai-insights`:

- `backstage.pluginId: 'search-ai-archeology'`; package `@ai-crew-suite/plugin-agent-search-archeology`.
- Primary surface is a **standalone research page** via `PageBlueprint`, with a secondary **`EntityCardBlueprint`** card ("who knows this component?") — the one plugin in this series where an entity card is genuinely apt, since the subject is an existing catalog component.
- **`IdentityStatusBadge` is the defining detail.** `offboarded` must read as *"historical contributor — no longer reachable"*, never as a normal expert entry, and `moved_team` must show the current team so a reader knows where to look. Getting this wrong sends people to ex-employees.
- `SignalBreakdown` exposes the authored/reviewed/triaged counts behind every score, so a ranking is auditable in the UI rather than an opaque number. This is also the guard against the matrix being read as a performance metric — the UI shows *evidence*, not judgment.
- Every expert row carries `EvidenceCitationList` deep links to real commits/PRs/tickets; a person with no clickable evidence must not be displayed.
- `TruncationBanner` offers an explicit **continue** action that posts the `cursor`, so a rate-limited deep dive resumes on user intent rather than silently appearing complete.
- `InvestigationTimeline` renders per-node `step` events (scope → retrieve → history → resolve → rank) so a multi-minute research run shows progress instead of a spinner.
- `inconclusive`, `out_of_scope`, and `partial` render as first-class explained outcomes naming the missing source, not as errors.

## Test Strategy

Reuse the `catalog-ai-insights` test-layer table (unit/contract/backend integration/runtime integration/LLM evaluation/full-stack E2E) and its network policies. Deltas only:

- **Unit (the highest-value layer here)**: `identity.ts` resolution matrix — resolvable email → `active` with team; email resolving to a different current team → `moved_team`; **no `User` entity → `offboarded`** (the foundation doc's `retired-dev`); missing/ambiguous email → `unresolved`; legacy-domain alias applied before lookup; `+`-suffix and case normalization. `rank.ts` weighting — active outranks offboarded at equal evidence, recency decay ordering, reviewer-heavy vs author-heavy comparison, deterministic tie-breaks, `maxExperts` truncation. `scope.ts` era clamping and the scope-required refusal. `targetIsolation.ts` path capping.
- **Workflow (runtime) tests**: drive `ArcheologyGraph.run()` with a stubbed `WorkflowContext` (`invokeTool` mock router keyed by `toolId` + args) plus a fake `CatalogEntityResolver` — the codebase-accurate replacement for the foundation doc's `github.service` `createServiceRef` sketch. **Headline scenario (the foundation doc's own test)**: history yields `retired-dev@company.com` (2022) and `active-lead@company.com` (2025); the catalog contains only `User:active-lead` with `memberOf: ['team-core-infra']`. Assert `active-lead` ranks as prime expert with team `core-infra`, `retired-dev` appears under `offboardedContributors` labeled `offboarded`, **no exception is thrown**, and the state channel stays intact.
- **Rate-limit resilience tests** (the foundation doc's §2): inject a `429` mid-history-pagination and assert the cursor is checkpointed, status is `truncated`, collected evidence is preserved, and `resume()` re-enters at **history** **without** re-invoking `knowledge.retrieve` or re-listing completed pages. Also assert a non-retryable auth error degrades that one source to a limitation while other sources still contribute.
- **Hybrid-isolation tests**: assert `knowledge.retrieve` output influences only the target path set, and that the resulting expert list is byte-identical when retrieval is replaced by caller-supplied `paths` — proving retrieval cannot name a person.
- **Degradation matrix**: no vector store → path fallback + limitation; no VCS driver → ticket-only matrix + limitation; `list_commits` absent → PR/ticket ranking with `commit history unavailable`; no ticket driver → VCS-only; **all** sources absent → `inconclusive`, never a fabricated expert.
- **Anti-fabrication tests**: a model response naming a person, team, SHA, or ticket absent from the computed record is stripped and the matrix degrades to fact-only; assert the emitted narrative never contains an identity outside `experts` ∪ `offboardedContributors`.
- **Privacy tests**: assert no identity, email, or matrix content is passed to any indexing/embedding path, and that catalog reads carry the caller's credentials (a caller who cannot read a `User` sees `unresolved`, not a leaked profile).
- **Backend integration**: `startTestBackend` with this module + AI Core + `mockServices.rootConfig` + `mockServices.database`, plus a stub catalog resolver and fixture VCS/ticket tools, asserting boot registration, per-node SSE ordering, page checkpointing, resume flow, and `expertise-matrix` artifact persistence.
- **E2E**: extend the shared fixture profile with fixture TechDocs/ADR content, fixture commit/PR/ticket history, and catalog `User`/`Group` entities (one active, one deliberately absent). Playwright: open the research page → ask the question → watch the investigation timeline → assert the matrix ranks the active lead first and labels the retired contributor → expand signal breakdown and follow an evidence link; plus a truncated-run continue path. Add `yarn test:e2e:search-ai-archeology`.

## Security and Operational Guardrails

`catalog-ai-insights` guardrails apply unchanged (identity propagation, redaction before model/SSE/artifacts, tool/token/wall-clock caps, correlation IDs). Archeology-specific additions — most of which are about **people data**, since that is what this agent handles:

- **Read-only by construction.** No write tool is allow-listed, so there is no approval gate and no path to mutate anything. The agent cannot contact the people it identifies.
- **Never index personal data.** Identities, emails, and the matrix stay in the run artifact and never enter vector storage or session memory beyond the active investigation — no durable people-profile store is created.
- **Authorization is enforced per-caller.** Repo, ticket, and catalog reads propagate the requester's credentials; a user cannot use archeology to read history or `User` entities they could not read directly. Unreadable identities surface as `unresolved`.
- **Not a performance tool.** Scores measure traceable involvement with specific code, never merit; the prompt forbids skill or seniority characterizations and `SignalBreakdown` keeps the raw counts visible. Document this prominently — the same data reframed becomes a surveillance metric.
- **Never fabricate a person.** An unresolvable actor is reported as `offboarded`/`unresolved` with its raw provider identity, never as a guessed teammate. Misattribution here wastes real people's time.
- Cap and redact evidence: bounded file excerpts, bounded ticket comment text, and secret-shaped strings scrubbed from commit messages and comments before they reach the model, SSE, artifacts, or logs.
- The research question is **untrusted input**: cap length, delimit it in the prompt with an instruction not to follow embedded directives, and refuse an unscoped question rather than searching org-wide.
- Third-party APIs are metered: every history query carries a bounded window, per-source budgets are enforced, and `429`s degrade to truncation so archeology cannot exhaust an org's GitHub or Jira rate limits.

## Ordered Implementation Milestones

### Milestone 0: Core contract extensions and pure engines

- [ ] Extend `plugin-ai-core-node`, all additive: `vcs.repository.list_commits` driver op + tool (required `TimeRange`), optional filter args on `listPullRequests` plus `reviewers` on `PullRequestSummary`, `TimeRange` on `TicketSearchQuery`, and `findUserByEmail` on `CatalogEntityResolver`.
- [ ] Define `ArcheologyRequest`, `ResearchScope`, `ContributionEvidence`, `ResolvedIdentity`, `ExpertRecord`, `ExpertiseMatrix`, and the config schema.
- [ ] Implement + unit-test `scope.ts`, `targetIsolation.ts`, `identity.ts`, `rank.ts`.

Exit criteria: the four-outcome identity matrix and the ranking weights are provably deterministic on fixture org graphs; existing drivers still compile against the additive changes.

### Milestone 1: Ticket-and-retrieval backend (viable before the VCS work)

- [ ] Scaffold the package with a barrel `index.ts` in every directory, register the runner/agent/manual trigger, config parsing; register in root `tsconfig.json` + `.eslintrc.cjs`.
- [ ] Implement scope → retrieve → history (tickets only) → resolve → rank → `expertise-matrix`, with `DocRetriever` and `OrgGraphResolver`.
- [ ] Wire into `packages/backend` and add the `ai.agents.searchArcheology` config block.
- [ ] Add unit, workflow-scenario (mock router + fake resolver), degradation-matrix, and backend integration tests.

Exit criteria: a usable matrix is produced from `assigneeHistory` + comment authors + retrieval alone, with `commit history unavailable` recorded — proving the plugin ships value before the blocking VCS work lands.

### Milestone 2: VCS history evidence

- [ ] Wire `vcs.repository.list_commits` and windowed `vcs.pull_request.list` into `history.ts`; add authorship and review signals to ranking.
- [ ] Headline-scenario tests (`active-lead` vs `retired-dev`), hybrid-isolation tests, and anti-fabrication tests.

Exit criteria: the foundation doc's authorship scenario passes end to end with deterministic ranking and correct offboarded labeling.

### Milestone 3: Rate-limit resilience

- [ ] Implement per-page cursor checkpointing, error classification (retryable vs per-source vs fatal), `resume()` re-entering at history, and truncation reporting.
- [ ] `429`-injection tests proving no loss of collected evidence and no re-running of retrieval.

Exit criteria: an interrupted deep run resumes at the exact node boundary and never repeats completed work.

### Milestone 4: Frontend and E2E

- [ ] Scaffold the empty frontend package (`ApiBlueprint` + `PageBlueprint` + `EntityCardBlueprint`, research form, investigation timeline, matrix table, identity badges, signal breakdown, evidence citations, truncation banner) with barrel indexes, and register it in `packages/app`.
- [ ] Component tests (loading, streaming, complete/partial/truncated/inconclusive/out_of_scope, each identity status, replay) plus accessibility checks.
- [ ] Extend the E2E fixture profile and add Playwright research, offboarded-labeling, evidence-link, and continue-truncated scenarios with screenshot review.

Exit criteria: `yarn test:e2e:search-ai-archeology` demonstrates question → timeline → ranked matrix with a correctly labeled legacy contributor, plus a resume path, without external infrastructure.

### Milestone 5: Production readiness

- [ ] Document model registration, retrieval source setup, VCS/ticket driver configuration, email-alias curation, ranking-weight tuning, and — prominently — the **not-a-performance-metric** boundary.
- [ ] Dashboards/alerts for research volume, **identity-resolution rate** (the key quality metric), offboarded share, truncation/rate-limit rate, inconclusive rate, and token cost per investigation.
- [ ] Opt-in real-model evaluation suite (grounding: every expert and claim cites supplied evidence IDs; no invented people, teams, SHAs, or tickets; no skill characterizations) within budget.

Exit criteria: staged rollout with bounded third-party API usage, verified citation grounding, and the people-data guardrails documented for reviewers.

## Definition of Done

- Additive core extensions land in `plugin-ai-core-node` (`list_commits`, PR filters + `reviewers`, `TicketSearchQuery` `TimeRange`, `findUserByEmail`) without breaking existing drivers; this plugin's package, agent, runner (`run` + `resume`), trigger, config schema, and read-only allow-list are registered (root + backend/app wiring included) with a barrel `index.ts` in every directory.
- Runs execute through the real AI Core controller/runtime with persisted replayable events, per-page checkpoints, session continuity for follow-ups, and `expertise-matrix` artifacts.
- The hybrid strategy is provable: retrieval narrows target paths only, history volume is bounded by config rather than repo size, and no code diff is ever embedded.
- Identity resolution yields exactly four explicit outcomes; an absent `User` entity produces a labeled `offboarded` contributor rather than an exception or a silent drop, and no identity is ever fabricated.
- Expertise ranking is pure, config-weighted, deterministic, and auditable via `signals`; active and recently-involved people outrank stale contributors at equal evidence.
- A `429` mid-run preserves collected evidence, reports `truncated` with a cursor, and resumes at the history node without re-running retrieval.
- The plugin registers **no write tool**, contacts nobody, and never writes identities or the matrix into vector storage.
- Frontend renders the timeline, ranked matrix, identity statuses, signal breakdown, and evidence links over live SSE and replay via `ApiBlueprint`/`PageBlueprint`; Playwright verifies the offboarded-labeling and resume paths on fixtures.
- No output surface (SSE, artifacts, logs, tests) contains secrets, unbounded history payloads, uncited experts, fabricated identities, or any characterization of a person's skill or performance.

## Frontend Completed

Completed

Implemented the frontend plugin at:

`/home/kevin/Repos/backstage/ai-crew-suite/plugins/frontend/plugin-ai-agent-frontend-search-ai-archeology`

### Delivered

- Standalone route: `/search-ai-archeology`

- Alpha and legacy frontend plugin registrations.

- Authenticated AI Core SSE client for:

  - Starting `search-ai-archeology` manual runs.
  - Replaying persisted runs through `?run=<id>`.

- Typed browser contracts for the actual deployed `expertise-matrix` artifact.

- Reducer-backed run hook with safe malformed-artifact handling.

- Research dialog requiring:

  - A scoped research question.
  - Either repository URL or catalog entity reference.

- UI rendering for:

  - Research progress.
  - Familiarity candidates.
  - Explicit unresolved/offboarded contributors.
  - Ticket citations.
  - Backend limitations.
  - Status and confidence.

- Clear UI wording that scores are ticket-triage familiarity evidence only, __not__ skill, merit, productivity, performance, or seniority measures.

- README and backend implementation-plan frontend completion section.

- Focused tests for artifact reduction/malformed payloads and matrix rendering.

### App and monorepo wiring

Registered the frontend package in:

- `/home/kevin/Repos/backstage/ai-crew-suite/tsconfig.json`
- `/home/kevin/Repos/backstage/ai-crew-suite/.eslintrc.cjs`
- `/home/kevin/Repos/backstage/ai-crew-suite/packages/app/package.json`
- `/home/kevin/Repos/backstage/ai-crew-suite/packages/app/src/App.tsx`
- `/home/kevin/Repos/backstage/ai-crew-suite/yarn.lock`

## Backend Completed

Implemented the `search-ai-archeology` backend plugin as the contract-verified, read-only ticket-triage research milestone.

### Delivered

- New backend module at:
  - `/home/kevin/Repos/backstage/ai-crew-suite/plugins/backend/plugin-ai-agent-backend-search-ai-archeology`

- Stateless manual agent: `search-ai-archeology`

- Workflow: `knowledge-archeology`

- Read-only tool allowlist:

  - `project.ticket.search`
  - `project.ticket.get`

- Bounded/versioned request parsing with required repo/entity scope.

- Ticket-detail evidence extraction from assignee history and comment authors.

- Failure-tolerant, budgeted tool runner that records limitations instead of expanding scope or failing the run.

- Explicit identity outcomes:

  - `unresolved`
  - configured `offboarded`
  - preserves raw provider actor identities; does not invent catalog users or teams.

- Deterministic familiarity ranking based on ticket-triage evidence only.

- Cited `expertise-matrix` artifact output.

- Explicit artifact limitations for unavailable commit/blame history, PR reviewer metadata, catalog identity mapping, and time-bounded ticket search.

- Package README, config schema, implementation completion documentation, tests, and module exports.

### Wiring

Registered the module in:

- `/home/kevin/Repos/backstage/ai-crew-suite/tsconfig.json`
- `/home/kevin/Repos/backstage/ai-crew-suite/.eslintrc.cjs`
- `/home/kevin/Repos/backstage/ai-crew-suite/packages/backend/package.json`
- `/home/kevin/Repos/backstage/ai-crew-suite/packages/backend/src/index.ts`
- `/home/kevin/Repos/backstage/ai-crew-suite/app-config.yaml`



