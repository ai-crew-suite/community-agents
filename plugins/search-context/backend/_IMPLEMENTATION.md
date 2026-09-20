# Search AI Context Implementation Plan

## Overview

This plugin connects isolated documentation silos across disparate tools and messaging spaces to surface contextually relevant, unified engineering answers natively inside Backstage.

- **The Task**: Resolving complex, multi-entity architectural dependencies and impact analysis queries that standard keyword or isolated-file searches cannot handle.
- **The Logic**: A **Stateful Graph Investigation Agent** combines semantic text retrieval (`knowledge.retrieve`) over the Backstage Software Catalog with active tool calls to upstream repositories. When an engineering mutation occurs (such as an API deprecation), a multi-agent loop evaluates catalog ownership relationships (`dependsOn`), runs static validation checks across downstream consumer repos via the **GitHub/GitLab tool pack**, and generates an actionable **Impact Assessment Artifact** summarizing exactly which components and teams will be broken.

## Goal

Implement `@ai-crew-suite/plugin-agent-search-context-backend` as an AI Core backend module that answers *"what breaks if I change this?"* Given one source entity plus a concrete change signature (a deprecated endpoint, a renamed schema field), it recursively walks the catalog's `dependsOn`/`providesApi`/`dependencyOf` edges to build a bounded multi-tier consumer graph, then **verifies each candidate at the code level** with a targeted `vcs.repository.search` — separating consumers that genuinely reference the changed symbol from those merely declared as dependents. The output is a cited `ImpactAssessment` classifying every consumer as `impacted`, `unaffected`, or `unknown`, rolled up by owning team. A paired frontend plugin renders the dependency graph, the code-level evidence, and the owner rollup.

Reuse the architecture proven by `plugin-ai-agent-backend-catalog-ai-insights` (its `_IMPLEMENTATION.md` is the source of truth for repository conventions, workflow-runner mechanics, event contracts, monorepo wiring, and test-layer definitions). This plan documents only what differs: **bounded recursive graph traversal**, **code-level impact verification**, **deterministic severity/owner rollup**, and **per-repository resumable validation**.

## Delivery Boundary

### In scope

- One impact question per run — a source entity plus a change signature — via `/agents/search-ai-context/runs`.
- Deterministic `scope → crawl → retrieve → validate → classify → report` graph. Graph traversal, code-match classification, severity, and owner rollup are pure code; the model only writes the narrative and per-consumer rationale.
- Bounded recursive catalog traversal via the landed `CatalogEntityResolver.getRelations` (depth- and count-capped, cycle-safe).
- Per-consumer code verification through `vcs.repository.search`, with the repo resolved from catalog annotations.
- Optional `knowledge.retrieve` over RFCs/schemas for change context — never as a substitute for a code match.
- An `ImpactAssessment` artifact where every classification cites the specific relation edge and code match (or records why verification was impossible).
- Per-repository checkpointing so a network failure at repo 12 of 50 resumes without re-crawling the catalog.

### Explicitly out of scope for v1

- **Any write.** No tickets, PRs, messages, or catalog edits. This is a read-only analysis agent, so there is no approval gate.
- **Event-triggered runs.** The foundation doc's `coreServices.events` subscription is deferred: no events service exists anywhere in this repo (see Prerequisites). v1 is on-demand only, and the request contract is shaped so event wiring is additive later.
- Notifying impacted teams. The assessment identifies owners; contacting them is a human decision and `communication.message.post` is deliberately not allow-listed.
- Org-wide or unscoped scans — a request without a source entity is refused rather than crawling the whole catalog.
- Semantic/AST-level breakage analysis. v1 verifies *textual references* to the change signature; it does not prove a call site actually breaks, and the report says so.
- Transitive impact beyond `maxDepth` hops, and cross-repo build-graph analysis (package manifests, lockfiles) — catalog edges plus code search only.

## Required Prerequisites

Contracts verified against the current codebase. As with the catalog plan: no fictional service refs — the foundation doc's `github.service` sketch (`searchCodeInRepository`) must **not** be implemented as written.

**Correction to the earlier draft, in the plugin's favor.** Luna gated this work on the shared `CatalogEntityResolver`/relation traversal existing "before implementation". It **has since landed**: `plugin-ai-core-node/src/catalog/` exports `CatalogEntityResolver` with `getRelations({ entityRef, relationTypes, maxDepth, limit })` returning a `CatalogRelationGraph { rootRef, entities, relations, truncated }` — exactly the bounded, cycle-aware traversal this plugin needs, with pure mappings (`toCatalogEntityRelations`) unit-testable without a catalog server. It also exports `extractIntegrationReferences`, whose `repositories` field resolves a consumer entity to its repo. The plugin's two hardest primitives are **available today**.

**Confirmed gate — there is no events service.** `grep` for `coreServices.events` / `eventsServiceRef` / `EventsService` across `plugins` and `packages` returns **nothing**, and `TriggerBinding` is `{ id, source?: string, agentId? }` — a free-form `source` string with no dispatch mechanism behind it. An event-driven run cannot be wired today; Luna's deferral is correct and I keep it.

| Capability | Required contract | Current state | Required action |
| --- | --- | --- | --- |
| Recursive dependency crawl | `CatalogEntityResolver.getRelations({ entityRef, relationTypes, maxDepth, limit })` → `CatalogRelationGraph` | **Exists** — landed in `plugin-ai-core-node/src/catalog/`, bounded by `maxDepth` + `limit`, exposing a **`truncated`** flag | Use directly for the multi-tier crawl. Request `['dependsOn', 'dependencyOf', 'providesApi', 'apiConsumedBy']`; treat `truncated: true` as a first-class `partial` outcome rather than a silent cut. |
| Consumer → repo resolution | `resolver.getIntegrationReferences(entityRef)` / `extractIntegrationReferences(entity).repositories` | **Exists** — normalizes `github.com/*`, `gitlab.com/*`, and `backstage.io/source-location` annotations into a `repositories` array | Replaces the foundation doc's ad-hoc `'://github.com'` annotation reading. A consumer with no resolvable repo becomes `unknown`, never `unaffected`. |
| Owner rollup | `CatalogEntitySummary.owner` | **Exists** on every summary returned by the crawl | Group impacted consumers by `owner`; no extra lookup needed. |
| **Code-level verification** | `vcs.repository.search({ repoUrl, query })` → `RepositorySearchResult[]` (`path`, `line?`, `snippet?`, `ref?`) | **Exists**, `effect: read`, **but driver quality is uneven** — GitHub (`octokit.search.code`), GitLab (`api.Search.all('blobs')`), and Azure (`gitApi.getItems`) implement real search, while **Bitbucket, Gerrit, and generic Git log a warning and return `[]`** | Primary impact signal. An empty result from a *capable* driver means `unaffected`; an empty result from a **stub** driver must be `unknown`. Conflating them would silently under-report breakage — the single most dangerous failure mode in this plugin. Detect via `providerId` against a config-declared capability list and record a limitation. |
| Targeted file reads | `vcs.repository.read_file` | Exists, `effect: read` | Pull bounded context around a match so the report shows the call site, not just a line number. |
| Change/schema context | `knowledge.retrieve` + `DefaultRetrievalPipeline` | Exists | Optional: RFC/ADR/schema prose explaining the change. **Never** promotes a consumer to `impacted` on its own. |
| Resumable validation | `CheckpointStore` + `WorkflowRunner.resume()` | **Exist** | Checkpoint after each repository so a failure at repo 12/50 resumes at validation without re-crawling the catalog (the foundation doc's §2 requirement). |
| **Event-triggered analysis** | An events service the module can subscribe to | **Not present** — no `coreServices.events`, no `eventsServiceRef`, no `EventsService` anywhere; `TriggerBinding.source` is an unbacked free-form string | Defer. Register only a `manual` trigger; keep `ImpactRequest.source` a discriminated field so an `event` variant is purely additive when an events contract lands. **Blocking for automatic runs only.** |
| Scheduler | — | Available but **unused** | Impact analysis is change-driven, not periodic; there is no background path and therefore no scheduler section in this plan. |

## Package Shape

Backend module from the same template as `catalog-ai-insights`; only the domain directories differ. Every directory carries a barrel `index.ts` re-exporting its public surface, matching the reference plugin's export styling.

```text
plugins/backend/plugin-ai-agent-backend-search-ai-context/
  package.json          # role: backend-plugin-module, pluginId: ai-core
  tsconfig.json
  config.d.ts
  README.md
  src/
    index.ts            # barrel: module default + public types
    module.ts           # registers runner, agent, manual trigger
    agent.ts            # SEARCH_CONTEXT_AGENT_ID, tool allow-list, system prompt
    config.ts           # readSearchContextConfig (ai.agents.searchContext)
    workflow/
      index.ts          # barrel
      ImpactGraph.ts            # WorkflowRunner id 'cross-service-impact' (run + resume)
      state.ts                  # ImpactState (graph, queue, cursor, evidence)
      scope.ts                  # pure: request -> ChangeSignature + bounded scope
      crawl.ts                  # getRelations traversal -> DependencyNode[]
      signature.ts              # pure: change -> ordered search query variants
      validate.ts               # per-repo vcs.repository.search, page-checkpointed
      classify.ts               # pure: evidence -> impacted|unaffected|unknown + severity
      rollup.ts                 # pure: classified consumers -> per-owner rollup
      assessment.ts             # ImpactAssessment schema, validation, degradation
    services/
      index.ts          # barrel
      DependencyCrawler.ts      # CatalogEntityResolver adapter: bounded multi-tier walk
      RepoCapabilityRegistry.ts # providerId -> search-capable? (stub-driver guard)
      ImpactToolRunner.ts       # capped invokeTool facade, per-repo error classification
      ImpactArtifactWriter.ts
    @types/
      index.ts          # barrel: shared request/assessment contracts
    __tests__/
    workflow/__tests__/
    services/__tests__/
```

- `createBackendModule` with `pluginId: 'ai-core'`, `moduleId: 'agent-search-ai-context'`.
- `module.ts` deps: `coreServices.rootConfig`, `coreServices.logger`, `coreServices.discovery`, `coreServices.auth`, `catalogServiceRef`, plus `agentExtensionPoint`, `triggerExtensionPoint`, `workflowRunnerExtensionPoint`. **No new core service keys are introduced**; `coreServices.scheduler` is intentionally unused, and `coreServices.events` is not referenced because it does not exist.
- Package naming, scripts, Apache header, root `tsconfig.json` references, and `.eslintrc.cjs` role overrides follow `catalog-ai-insights` and `plugin-registration.md` verbatim (not repeated here).

## Monorepo And App Wiring

Same delegated-but-verified steps as `catalog-ai-insights` (see that plan's "Monorepo And App Wiring"). Deltas:

- **Backend load**: add `"@ai-crew-suite/plugin-agent-search-context-backend": "workspace:^"` to `packages/backend/package.json` and the matching `backend.add(loadBackendFeature(import(...)))` line in `packages/backend/src/index.ts`.
- **VCS driver choice materially changes output quality.** With GitHub, GitLab, or Azure configured, code verification is real. With Bitbucket, Gerrit, or generic Git, `searchRepository` returns `[]` after a warning, so **every** consumer resolves to `unknown` and the assessment is honest but low-value. Document this in the package README so an operator is not misled by a clean-looking report.
- **Catalog dependency**: the crawl needs a populated catalog with real `dependsOn`/`providesApi` relations. A source entity with no relations yields `no_consumers`, which is a legitimate answer, not a failure.
- **App config**: the module throws at boot without `ai.agents.searchContext.model`; add the config block (see Configuration) before enabling the load.
- **Frontend registration**: `plugins/frontend/plugin-ai-agent-frontend-search-ai-context/` exists but is **empty** — scaffold it from scratch. Add the workspace dependency to `packages/app/package.json`, import its `/alpha` default export in `packages/app/src/App.tsx`, and extend plugin-ID expectations in `packages/app/src/App.test.tsx`.
- **Yarn PnP refresh**: `yarn install` after any `package.json` edit, then `yarn typecheck --force` / `yarn lint --force`.
## Agent Definition

```ts
{
  id: 'search-ai-context',
  modelRef: config.modelRef,          // installation-registered ID, e.g. 'search-context'
  workflowRef: 'cross-service-impact',
  memory: 'none',                     // each impact question is a fresh graph snapshot
  systemPrompt: SEARCH_CONTEXT_SYSTEM_PROMPT,
  toolIds: [
    'vcs.repository.search',
    'vcs.repository.read_file',
    'knowledge.retrieve',
  ],
  triggers: [
    { id: 'impact-analysis-on-demand', source: 'manual', agentId: 'search-ai-context' },
    // No event trigger: TriggerBinding.source is unbacked and no events service exists.
  ],
}
```

- **Every tool is `effect: 'read'` and there is no write tool at all** — hence no approval gate anywhere in this plugin, by design rather than omission.
- Catalog traversal goes through the injected `CatalogEntityResolver` (a typed core contract) rather than a tool, matching how `catalog-ai-insights` consumes it.
- `memory: 'none'` because an impact assessment must reflect the catalog and code **as they are now**; carrying a prior run's graph forward would risk reporting stale consumers as impacted.
- System prompt rules: consumer classifications, severities, and the owner rollup are supplied **pre-computed** and must be quoted verbatim; never invent a consumer, owner, repository, file path, or line number; cite `dep-N` for every relation edge and `match-N` for every code reference; **never** upgrade a consumer to impacted on documentation evidence alone — only a code match does that; state plainly when a consumer could not be verified and why; describe matches as *textual references*, not proven breakage.

## Run Input Contract

The generic `AgentRunInput.input.query` carries a versioned JSON payload. `source` is a discriminated field so an `event` variant is additive once an events contract lands.

```ts
type ImpactRequest = {
  version: 1;
  source: 'manual';              // 'event' reserved; see Prerequisites
  entityRef: string;             // required: 'component:default/core-payment-api'
  change: {
    kind: 'endpoint_removed' | 'endpoint_deprecated' | 'field_renamed'
        | 'field_removed' | 'signature_changed';
    symbol: string;              // required: '/v1/payments/charge' or 'PaymentIntent.legacyId'
    replacement?: string;        // suggested migration target, echoed into the report
    aliases?: string[];          // additional spellings (client wrappers, constants)
  };
  maxDepth?: number;             // relation hops, clamped by config
  relationTypes?: string[];      // override the default edge set
  cursor?: string;               // resume an interrupted validation pass
};
```

Validation requires `entityRef` **and** a non-empty `change.symbol` (an unscoped or symbol-less request is refused, not broadened), clamps `maxDepth` and the consumer count, restricts `relationTypes` to a known set, and treats the symbol as untrusted input for both prompt and search-query construction.

## Impact Workflow

`ImpactGraph` registers as `WorkflowRunner` id `cross-service-impact` and implements **both** `run()` and `resume()` — the latter for validation continuation, not approval. It realizes the foundation doc's network: **Crawl Catalog → Build Component Graph → Run VCS Static Validation → Emit Impact Artifact**. Traversal, classification, and rollup are deterministic; the model narrates.

### Deterministic graph nodes

1. **scope** — validate `ImpactRequest`; `scope.ts` resolves the source entity via `getEntitySummary` and computes bounded traversal parameters. `signature.ts` (pure) expands `change.symbol` plus `aliases` into an ordered list of search query variants (exact string, quoted path, constant-name form). Unresolvable entity → terminal `out_of_scope` with **no** model call.
2. **crawl** — `DependencyCrawler` calls `CatalogEntityResolver.getRelations` with the configured edge set and caps, producing `DependencyNode[]` with hop distance from the root. The resolver's own bounding plus a visited-set guard make the walk safe on cyclic graphs; `truncated: true` is propagated as a `partial` status naming the cap that fired. `getIntegrationReferences` then resolves each consumer to a repository; a consumer with no repo is immediately `unknown` (`no_repository`).
3. **retrieve** *(optional)* — `knowledge.retrieve` fetches RFC/ADR/schema prose about the change to enrich the narrative and the suggested migration. This is **context only** and is structurally barred from influencing classification.
4. **validate** — for each consumer repo, `ImpactToolRunner` runs `vcs.repository.search` with the query variants, stopping at the first variant that matches. Matches become `CodeMatch` evidence (`match-N`), optionally enriched by a bounded `vcs.repository.read_file` around the hit. **`RepoCapabilityRegistry` gates interpretation**: an empty result from a search-capable provider is genuine absence, while an empty result from a stub driver is `unverifiable`. **The cursor is checkpointed after every repository**, so a failure at repo 12/50 resumes here rather than re-crawling the catalog.
5. **classify** — `classify.ts` (pure, no LLM) assigns each consumer `impacted` (≥1 code match), `unaffected` (capable driver, zero matches across all variants), or `unknown` (no repo, stub driver, or a per-repo error), plus a severity from match count, hop distance, and the change `kind`. This is exactly the foundation doc's assertion that `consumer-service-one` is flagged while `consumer-service-two` is `UNAFFECTED` — a set difference, not an inference.
6. **report** — `rollup.ts` (pure) groups impacted consumers by `owner` into per-team work lists. One model call writes the narrative and per-consumer rationale from supplied evidence only; `assessment.ts` re-validates that no consumer, owner, path, or line appears in the prose that is absent from the computed record, degrading to a fact-only assessment on violation. Emits the `impact-assessment` artifact.

### State and output schema

```ts
type EvidenceRef = { id: string; source: 'relation' | 'code' | 'knowledge'; summary: string; reference?: string };

type ChangeSignature = {
  kind: ImpactRequest['change']['kind'];
  symbol: string;
  replacement?: string;
  queryVariants: string[];       // ordered, deterministic from symbol + aliases
};

type DependencyNode = {
  entityRef: string;
  kind: string;                  // 'Component' | 'API' | 'Resource'
  owner?: string;                // from CatalogEntitySummary
  depth: number;                 // hops from the changing entity
  viaRelation: string;           // 'dependsOn' | 'apiConsumedBy' ...
  repositories: string[];        // from getIntegrationReferences
  evidence: string[];            // dep-N
};

type CodeMatch = {
  id: string;                    // 'match-1' ...
  repoUrl: string;
  path: string;
  line?: number;
  snippet?: string;              // redacted, bounded
  matchedVariant: string;        // which query variant hit
};

type ConsumerImpact = {
  node: DependencyNode;
  classification: 'impacted' | 'unaffected' | 'unknown';
  reason: 'code_match' | 'no_match' | 'no_repository'
        | 'search_unsupported' | 'search_failed';
  severity: 'critical' | 'major' | 'minor' | 'info';
  matches: CodeMatch[];
  rationale: string;             // model copy; must cite dep-N / match-N
};

type OwnerRollup = {
  owner: string;                 // 'team-checkout'
  impactedCount: number;
  highestSeverity: ConsumerImpact['severity'];
  entityRefs: string[];
};

// ImpactState: { request, signature, graph: DependencyNode[], queue: string[],
//   cursor?, consumers: ConsumerImpact[], limitations: string[],
//   status: 'complete'|'partial'|'truncated'|'no_consumers'|'out_of_scope' }

type ImpactAssessment = {
  entityRef: string;
  change: ChangeSignature;
  status: ImpactState['status'];
  consumers: ConsumerImpact[];   // every crawled consumer, all three classes
  owners: OwnerRollup[];         // impacted-only, severity-sorted
  counts: { impacted: number; unaffected: number; unknown: number };
  graphTruncated: boolean;       // resolver hit maxDepth/limit
  narrative: string;             // model summary, validated against the record
  confidence: 'high' | 'medium' | 'low';
  cursor?: string;               // set when validation truncated
  limitations: string[];         // e.g. 'bitbucket search unsupported'
  evidence: EvidenceRef[];       // dep-N + match-N (+ kb-N) bundle
};
```

Status mapping is fixed in code, not inferred: every consumer verified by a capable driver → `complete`; any `unknown` present → `partial` with the reason named; validation interrupted → `truncated` with a `cursor`; crawl found no consumers → `no_consumers`; unresolvable source entity → `out_of_scope`. `confidence` is `low` whenever `graphTruncated` is true, any driver was search-incapable, or `unknown` exceeds `impacted`.

## Bounded Recursive Graph Traversal (New Structural Section)

The foundation doc's headline requirement is nested multi-tier traversal (Service A → API B → Component C), and its main hazard is an unbounded crawl of a large catalog.

- **The bounding already exists.** `getRelations({ maxDepth, limit })` caps hops *and* total visited entities and reports `truncated`, so this plugin does not hand-roll traversal safety — it consumes a contract designed for it and surfaces the flag.
- `DependencyCrawler` adds only what the resolver does not: a **visited set keyed by `entityRef`** across successive calls, hop-distance annotation, and deduplication when two paths reach the same consumer (the nearer hop wins). Cyclic graphs terminate because a repeat ref is never re-expanded.
- **Direction matters.** For "who consumes this API?", the useful edges are the *inbound* ones (`dependencyOf`, `apiConsumedBy`); `dependsOn`/`providesApi` describe what the source itself needs. The default edge set includes both directions and each `DependencyNode` records `viaRelation`, so the report distinguishes a consumer from a dependency rather than blurring them.
- **Truncation is never silent.** `truncated: true` propagates to `graphTruncated`, forces `confidence: 'low'`, and names the cap that fired — an impact report that quietly omitted tier-3 consumers is worse than one that admits its horizon.
- Depth is deliberately shallow by default (`maxDepth: 3`): impact confidence decays fast with distance, and each extra hop multiplies expensive per-repo code searches. Crawl cost is bounded by config, not catalog size.

## Code-Level Impact Verification (New Structural Section)

This is what separates the plugin from reading `dependsOn` and calling it impact — and where a wrong answer is most costly.

- **A catalog edge is a hypothesis; a code match is evidence.** Every consumer is verified by search, so the foundation doc's `consumer-service-two` — a declared dependent that never touches the changed route — is correctly reported `unaffected` instead of alarming its team.
- `signature.ts` produces **ordered query variants** deterministically (exact symbol, quoted/escaped path form, constant-style identifier, plus caller-supplied `aliases`) and validation stops at the first hit. Ordering is fixed so two runs issue identical queries and results are reproducible.
- **The three-way classification is load-bearing.** `unknown` is not a soft `unaffected`: it means *we could not check*. Reasons are explicit (`no_repository`, `search_unsupported`, `search_failed`) so a reader knows whether to investigate manually.
- **Stub-driver detection is a correctness requirement, not polish.** Bitbucket, Gerrit, and generic Git return `[]` after logging a warning. Treating that as "no matches" would report an entire estate as `unaffected` while breakage ships. `RepoCapabilityRegistry` maps `providerId` → capability from a config-declared list, and an incapable driver forces `unknown` plus a limitation.
- **Textual, not semantic.** A match proves the symbol appears in the file, not that the call breaks; a comment or unrelated string can match. The report labels matches as references, severity accounts for match count rather than certainty, and the prompt forbids claiming proven breakage.
- Documentation evidence from `knowledge.retrieve` can never promote a classification — enforced in `classify.ts`, which receives only `CodeMatch[]` and capability metadata, never retrieval output.

## Deterministic Severity And Owner Rollup (New Structural Section)

The assessment's purpose is routing work to teams, so the rollup is pure code and traceable.

- `classify.ts` and `rollup.ts` are pure: `(matches, node, capability) => ConsumerImpact` and `(impacts) => OwnerRollup[]`. No AI Core, tool, or clock dependency, so every severity branch is unit-testable on fixtures.
- Severity is a **declared function** of match count, hop distance, and change `kind` — a removed endpoint outranks a deprecated one, and a direct consumer outranks a tier-3 one. Weights live in config so a reviewer can see why something is `critical`.
- Owner rollup uses `CatalogEntitySummary.owner` straight from the crawl — no second lookup, no inference. A consumer with no owner is grouped under an explicit `unowned` bucket rather than dropped, since unowned impacted code is itself a finding.
- Rollups are **impacted-only** and severity-sorted, so the UI leads with the team that must act first; `unaffected` and `unknown` remain available per-consumer but do not create team work items.
- Ordering is fully deterministic (severity, then impacted count, then stable ref ordering), so repeated runs over an unchanged catalog produce identical reports — a prerequisite for diffing assessments over time.

## Resumable Per-Repository Validation (New Structural Section)

The foundation doc's §2 requirement: a glitch at repository 12 of 50 must not restart the catalog crawl.

- `ImpactState` holds the completed crawl plus a **queue of pending repos** and a cursor; the cursor advances and is **checkpointed after each repository**, so a failure loses at most one repo's work.
- `resume()` re-enters at **validate** with the graph and prior matches intact and never re-runs `crawl` or `retrieve` — the crawl is the expensive, rate-limited part worth preserving, exactly as the foundation doc specifies.
- `ImpactToolRunner` classifies per-repo failures: rate-limit/timeout → **retryable**, leaving that repo in the queue and marking the run `truncated`; auth/not-found → terminal for that repo only, recorded as `unknown` with reason `search_failed` while the remaining repos proceed. One bad repo never fails the run.
- Resumption is **not** an approval path — this plugin has no write and no gate — which keeps `resume()` semantics unambiguous relative to the approval-`resume()` in sibling plans.
- Bounded on three axes: `maxConsumers`, `maxToolInvocations`, and a wall-clock budget. Exhausting any yields `truncated` plus a cursor so the user can explicitly continue rather than silently receiving a partial answer.

## Event-Trigger Readiness (Deferred, New Structural Section)

The foundation doc wants an upstream API-deprecation event to launch this analysis automatically. That cannot be built yet, so the plan makes the seam explicit rather than pretending otherwise.

- **What is missing**: no events service exists (`coreServices.events`, `eventsServiceRef`, `EventsService` all absent), and `TriggerBinding` is `{ id, source?: string, agentId? }` — a label with no dispatcher behind it. Registering an `event`-sourced trigger today would be decorative.
- **What v1 does instead**: registers only a `manual` trigger and keeps `ImpactRequest.source` a discriminated union member, so adding `source: 'event'` plus an `eventPayload` field is purely additive and requires no change to `scope.ts` or downstream nodes.
- **What landing the event path will need**: an events contract in AI Core that maps a payload to an `AgentRunInput`, plus a mapping function in this plugin translating a schema-registry/deprecation payload into `entityRef` + `change`. That mapping is the only genuinely plugin-specific piece, and it should be written as a pure function so it is testable before any events service exists.
- **Why deferral is safe**: nothing about the read-only graph changes. The workflow is already idempotent and side-effect-free, so automatic invocation adds no new risk beyond cost — which is why the config caps exist now rather than later.

## Vector Store Integration

- **No new vector infrastructure and no new indexing.** `knowledge.retrieve` reads the existing TechDocs/ADR/schema corpus owned by `plugin-ai-core-backend-module-retrieval-augmenter` and the pgvector/qdrant modules; run/checkpoint state lives in `plugin-ai-core-backend-module-runtime-store`.
- Retrieval is **narrative-only**: it explains *why* a change was made and what the migration is, and is structurally barred from `classify.ts`. Tests assert the `consumers` array and `counts` are byte-identical with retrieval enabled and disabled.
- Do not index code matches or the assessment itself — impact findings are point-in-time facts about a mutable codebase, and embedding them would create stale "X is broken" context that outlives the fix.

## Configuration

```yaml
ai:
  agents:
    searchContext:
      model: search-context         # installation-registered model ID, required
      maxDepth: 3                   # optional, default 3 relation hops
      maxConsumers: 50              # optional, default 50 verified consumers
      maxToolInvocations: 60        # optional, default 60 (one+ search per consumer)
      runTimeoutSeconds: 300        # optional, default 300 wall-clock budget
      maxMatchesPerRepo: 10         # optional, default 10 recorded code matches
      relationTypes:                # optional; default edge set for the crawl
        - dependsOn
        - dependencyOf
        - providesApi
        - apiConsumedBy
      search:
        capableProviders: ['github', 'gitlab', 'azuredevops']  # stub-driver guard
        readMatchContext: true      # optional, default true (bounded read_file per match)
      severity:
        weightMatchCount: 2         # optional, default 2
        weightDirectConsumer: 3     # optional, default 3 (depth 1)
        kindWeights:                # optional per-change-kind escalation
          endpoint_removed: 3
          field_removed: 3
          signature_changed: 2
          endpoint_deprecated: 1
          field_renamed: 1
```

`config.ts` mirrors `readCatalogAiInsightsConfig`: throw when the section or `model` is absent; document every default in `config.d.ts`. Validate at boot that `capableProviders` contains only known `VcsProviderId` values and that `relationTypes` are recognized — a typo'd relation would silently return an empty graph and report `no_consumers`, exactly the kind of quiet wrong answer this plugin must avoid.

## Shared AI-Core Work To Build First

- **Nothing is blocking for v1.** This is the first plugin in the series whose core dependencies are all present: `CatalogEntityResolver.getRelations`, `getIntegrationReferences`/`extractIntegrationReferences`, `vcs.repository.search`, `vcs.repository.read_file`, `knowledge.retrieve`, checkpoints, and `resume()` all exist today.
- **Optional quality improvement — extend VCS search coverage.** Implementing real `searchRepository` for Bitbucket/Gerrit (currently `return []` after a warning) directly converts `unknown` classifications into definite answers for those estates. Belongs in the provider modules, benefits any code-searching agent, and is the highest-leverage follow-up.
- **Optional — a `searchCapabilities` hint on `VcsDriver`.** Today capability must be inferred from `providerId` via config, which drifts if a stub driver is later implemented. A small `readonly capabilities: { search: boolean }` on the driver would let `RepoCapabilityRegistry` ask instead of guess. Additive and backward compatible.
- **Deferred — the events contract** (see Event-Trigger Readiness). Shared with any future event-driven agent; do not build a bespoke subscriber inside this plugin.
- **No new traversal, classification, or checkpoint machinery** — `scope.ts`/`signature.ts`/`classify.ts`/`rollup.ts` are plugin-local pure modules; the resolver, checkpoints, `resume()`, and runtime stores are consumed as-is.

## Frontend Plan

Mirror the `catalog-ai-insights` frontend layout and wiring exactly: `alpha.ts` composing extensions into a `createFrontendPlugin` `FrontendFeature`, `extensions/api.ts` using `ApiBlueprint.make({ params: defineParams => defineParams(createApiFactory({...})) })`, `extensions/components.ts` using `PageBlueprint.make({ name, params: { path, title, routeRef, loader } })` plus `EntityCardBlueprint.make(...)`, self-contained wire types in `@types/`, and an SSE client over `discoveryApi.getBaseUrl('ai-core')` with `eventsource-parser` and `Last-Event-ID` replay. Every directory carries a barrel `index.ts`. The package directory exists but is **empty** — scaffold it from scratch.

```text
plugins/frontend/plugin-ai-agent-frontend-search-ai-context/
  src/
    index.ts                      # barrel: public components/api/types
    alpha.ts                      # createFrontendPlugin: pluginId + extensions
    plugin.ts                     # legacy-system plugin + routable extension
    routes.ts                     # ROOT_PATH + rootRouteRef
    @types/
      index.ts                    # ImpactRequest/ImpactAssessment wire types
    api/
      index.ts                    # barrel
      apiRef.ts                   # searchContextApiRef
      client.ts                   # SearchContextClient: analyzeImpact(), continueRun(), streamRunEvents(), listAssessments()
    hooks/
      index.ts                    # barrel
      useImpactRun.ts             # pure reducer + hook (analyze/continue/reset)
    components/
      index.ts                    # barrel
      ImpactAnalysisPage.tsx      # standalone: change entry + assessment history
      ChangeSignatureForm.tsx     # entityRef + change kind/symbol/aliases + depth
      CrawlProgressPanel.tsx      # live per-node + per-repo progress from SSE
      DependencyGraphView.tsx     # multi-tier consumer tree with hop distance
      ConsumerImpactTable.tsx     # classification, severity, reason, owner
      ClassificationBadge.tsx     # impacted / unaffected / unknown (+ reason tooltip)
      CodeMatchList.tsx           # per-consumer path:line snippets, deep-linked
      OwnerRollupPanel.tsx        # per-team work list, severity-sorted
      TruncationBanner.tsx        # graph/validation truncation + continue action
      EntityImpactCard.tsx        # entity-page card: "who consumes this?"
    extensions/
      api.ts                      # ApiBlueprint.make(...)
      components.ts               # PageBlueprint.make(...) + EntityCardBlueprint.make(...)
    __tests__/
```

Frontend deltas vs `catalog-ai-insights`:

- `backstage.pluginId: 'search-ai-context'`; package `@ai-crew-suite/plugin-agent-search-context`.
- Primary surface is a **standalone analysis page** via `PageBlueprint`, plus an **`EntityCardBlueprint`** card on the API/component page — apt here because the subject is an existing catalog entity.
- **`ClassificationBadge` carries the plugin's core risk.** `unknown` must never render like `unaffected`: it needs a distinct treatment and a tooltip naming the reason (`no_repository`, `search_unsupported`, `search_failed`). A reader who mistakes "unverifiable" for "safe" ships the breakage this plugin exists to prevent.
- `CodeMatchList` deep-links every match to `path:line` in the provider, so an impacted claim is one click from proof. A consumer marked `impacted` with no clickable match must not render.
- `OwnerRollupPanel` is the actionable view — per-team lists sorted by severity — since the assessment's purpose is routing work, not just enumerating consumers.
- `DependencyGraphView` shows hop distance and `viaRelation` so a tier-3 consumer is visibly further away than a direct one, and renders the `graphTruncated` horizon explicitly.
- `TruncationBanner` offers an explicit **continue** action posting the `cursor`, so a partially-validated estate resumes on user intent rather than appearing complete.
- `no_consumers` and `out_of_scope` render as first-class explained outcomes, not errors.

## Test Strategy

Reuse the `catalog-ai-insights` test-layer table (unit/contract/backend integration/runtime integration/LLM evaluation/full-stack E2E) and its network policies. Deltas only:

- **Unit (the highest-value layer here)**: `crawl.ts` cycle safety (A→B→A terminates), depth capping, nearer-hop deduplication when two paths reach one consumer, and `truncated` propagation. `classify.ts` the full three-way matrix — match → `impacted`; capable driver + zero matches → `unaffected`; **stub driver + zero matches → `unknown`/`search_unsupported`**; no repo → `unknown`/`no_repository`; per-repo error → `unknown`/`search_failed`. `signature.ts` deterministic variant ordering. `rollup.ts` owner grouping, the `unowned` bucket, and severity sorting.
- **Workflow (runtime) tests**: drive `ImpactGraph.run()` with a stubbed `WorkflowContext` (`invokeTool` mock router keyed by `toolId` + args) plus a fake `CatalogEntityResolver` — the codebase-accurate replacement for the foundation doc's `github.service` `createServiceRef` sketch. **Headline scenario (the foundation doc's own test)**: `core-payment-api` with two catalog dependents; `vcs.repository.search` returns a `src/client.ts:42` match for `org/downstream-consumer-one` and `[]` for `org/downstream-consumer-two`. Assert **both** consumers were verified (two search invocations), `consumer-service-one` is `impacted` citing the match, `consumer-service-two` is `unaffected`, and the owner rollup lists `team-checkout` only.
- **Multi-tier test**: Service A → API B → Component C with `maxDepth: 3`; assert all three tiers appear with correct hop distances and `viaRelation`, and that `maxDepth: 1` yields only the direct tier plus `graphTruncated: true`.
- **Stub-driver safety test** (the plugin's most important guard): configure a Bitbucket-style provider outside `capableProviders`; assert every consumer is `unknown` with `search_unsupported`, `confidence: 'low'`, a named limitation, and — critically — that **nothing is reported `unaffected`**.
- **Resumability tests** (the foundation doc's §2): fail the search tool at repo 12 of 50; assert the cursor is checkpointed, status is `truncated`, prior matches survive, and `resume()` re-enters at **validate** **without** re-invoking `getRelations` or `knowledge.retrieve`. Also assert a single auth failure marks one repo `search_failed` while the rest complete.
- **Retrieval-isolation tests**: assert `consumers` and `counts` are byte-identical with retrieval enabled and disabled, and that a retrieval chunk asserting "service X is affected" cannot change X's classification.
- **Anti-fabrication tests**: a model response naming a consumer, owner, path, or line absent from the computed record is stripped and the assessment degrades to fact-only.
- **Backend integration**: `startTestBackend` with this module + AI Core + `mockServices.rootConfig` + `mockServices.database`, plus a stub resolver and fixture VCS tools, asserting boot registration, per-node/per-repo SSE ordering, checkpointing, resume flow, and `impact-assessment` artifact persistence.
- **E2E**: extend the shared fixture profile with the foundation doc's three-entity dependency graph and a fixture VCS driver returning one match and one miss. Playwright: open the analysis page → submit the change signature → watch crawl and per-repo validation progress → assert one consumer `impacted` with a clickable match and one `unaffected` → check the owner rollup; plus a truncated-continue path. Add `yarn test:e2e:search-ai-context`.

## Security and Operational Guardrails

`catalog-ai-insights` guardrails apply unchanged (identity propagation, redaction before model/SSE/artifacts, tool/token/wall-clock caps, correlation IDs). Impact-specific additions:

- **Read-only by construction.** No write tool is allow-listed, so there is no approval gate and no path to mutate anything or notify anyone.
- **Never report `unaffected` without positive verification.** An unverifiable consumer is `unknown`, always. This is the plugin's central safety property: a false `unaffected` sends a team to production with broken code.
- **Authorization is enforced per-caller.** Catalog traversal and repository searches propagate the requester's credentials, so impact analysis cannot be used to enumerate entities or read repositories the caller could not access directly. Inaccessible consumers surface as `unknown`, never as leaked metadata.
- **The change symbol is untrusted input** for two sinks: cap and delimit it in the prompt with an instruction not to follow embedded directives, **and** escape it when constructing provider search queries so a crafted symbol cannot alter query semantics or widen the search.
- Redact and bound code evidence: `snippet` is length-capped and scrubbed of secret-shaped strings before it reaches the model, SSE, artifacts, or logs — search results from consumer repos routinely contain configuration and credentials.
- The dependency graph reveals architecture; keep assessments in the run artifact scoped to the requester and out of vector storage, so the plugin does not accumulate a durable org-wide dependency map outside catalog permissions.
- Third-party search APIs are metered and per-repo: enforce `maxConsumers`, per-run tool caps, and a wall-clock budget so one broad change cannot exhaust an org's code-search quota; degrade to `truncated` rather than retrying unbounded.

## Ordered Implementation Milestones

### Milestone 0: Pure engines and contracts

- [ ] Confirm `CatalogEntityResolver.getRelations` / `getIntegrationReferences` and the `vcs.repository.search` tool against the installed code; enumerate search-capable providers for `capableProviders`.
- [ ] Define `ImpactRequest`, `ChangeSignature`, `DependencyNode`, `CodeMatch`, `ConsumerImpact`, `OwnerRollup`, `ImpactAssessment`, and the config schema.
- [ ] Implement + unit-test `scope.ts`, `signature.ts`, `classify.ts`, `rollup.ts`, and the `crawl.ts` visited-set/dedupe logic against fixture relation graphs.

Exit criteria: cycle-safe traversal, the three-way classification matrix (including stub-driver → `unknown`), and severity/owner rollup are provably deterministic on fixtures.

### Milestone 1: Crawl-and-verify backend

- [ ] Scaffold the package with a barrel `index.ts` in every directory, register the runner/agent/manual trigger, config parsing; register in root `tsconfig.json` + `.eslintrc.cjs`.
- [ ] Implement scope → crawl → retrieve → validate → classify → report with `DependencyCrawler`, `RepoCapabilityRegistry`, and `ImpactToolRunner`.
- [ ] Wire into `packages/backend` and add the `ai.agents.searchContext` config block.
- [ ] Add unit, workflow-scenario (mock router + fake resolver), multi-tier, stub-driver-safety, and backend integration tests.

Exit criteria: the foundation doc's two-consumer scenario classifies one `impacted` and one `unaffected` deterministically, with no real LLM and no live provider.

### Milestone 2: Resumable validation

- [ ] Implement the pending-repo queue, per-repository cursor checkpointing, per-repo error classification, and `resume()` re-entering at validate.
- [ ] Failure-injection tests at repo 12/50 proving no re-crawl and no lost matches, plus the one-bad-repo isolation case.

Exit criteria: an interrupted validation pass resumes at the exact repository boundary and never re-runs the catalog crawl.

### Milestone 3: Frontend and E2E

- [ ] Scaffold the empty frontend package (`ApiBlueprint` + `PageBlueprint` + `EntityCardBlueprint`, change form, crawl progress, dependency graph, consumer table, classification badges, code matches, owner rollup, truncation banner) with barrel indexes, and register it in `packages/app`.
- [ ] Component tests (loading, streaming, complete/partial/truncated/no_consumers/out_of_scope, all three classifications with each `unknown` reason, replay) plus accessibility checks — including an explicit assertion that `unknown` and `unaffected` are visually distinct.
- [ ] Extend the E2E fixture profile and add Playwright impact, match-deep-link, and continue-truncated scenarios with screenshot review.

Exit criteria: `yarn test:e2e:search-ai-context` demonstrates change → crawl → per-repo verification → classified consumers with owner rollup, plus a resume path, without external infrastructure.

### Milestone 4: Production readiness

- [ ] Document model registration, VCS driver capability implications (and that Bitbucket/Gerrit/generic Git yield `unknown`), relation-set tuning, severity weights, and the textual-not-semantic caveat.
- [ ] Dashboards/alerts for analysis volume, **verification coverage** (`impacted + unaffected` ÷ total — the key quality metric), `unknown` rate by reason, graph-truncation rate, and token/search-quota cost per run.
- [ ] Opt-in real-model evaluation suite (grounding: every consumer and claim cites `dep-N`/`match-N`; no invented consumers, owners, or paths; no proven-breakage language) within budget.
- [ ] Optional follow-up: implement Bitbucket/Gerrit `searchRepository` to convert `unknown` into definite answers.

Exit criteria: staged rollout with bounded search-quota usage, verified citation grounding, and the `unknown`-vs-`unaffected` distinction documented for operators.

## Frontend Completed

- Frontend plugin package with:

  - `search-ai-context` plugin ID
  - legacy plugin entry point and `/alpha` frontend-system entry point
  - `ApiBlueprint`, `PageBlueprint`, and `EntityCardBlueprint`
  - standalone route: `/search-ai-context`

- Typed authenticated AI Core SSE client:

  - Starts assessments via `agents/search-ai-context/runs`
  - Replays persisted events via `?run=<runId>`
  - Uses configured `ai.endpointPath`, defaulting to `ai-core`

- Typed run reducer/hook with safe malformed-artifact handling.

- Change assessment dialog:

  - Source catalog entity
  - Change kind
  - Changed symbol
  - Optional replacement

- Assessment UI:

  - Progress steps
  - First-class `complete`, `partial`, `no_consumers`, and `out_of_scope` outcomes
  - Consumer verification list
  - Code-match evidence links
  - Impacted-owner rollups
  - Explicit truncation warning
  - Limitations and textual-reference caveat

- Safety-critical classification presentation:

  - `impacted`, `unaffected`, and `unknown` render distinctly.
  - `unknown` includes its verification reason, such as `no_repository`, `search_unsupported`, or `search_failed`.
  - The UI explicitly states that unknown is not unaffected.

### Registration completed

Updated:

- `/home/kevin/Repos/backstage/ai-crew-suite/tsconfig.json`
- `/home/kevin/Repos/backstage/ai-crew-suite/.eslintrc.cjs`
- `/home/kevin/Repos/backstage/ai-crew-suite/packages/app/package.json`
- `/home/kevin/Repos/backstage/ai-crew-suite/packages/app/src/App.tsx`
- `/home/kevin/Repos/backstage/ai-crew-suite/packages/app/src/App.test.tsx`
- `/home/kevin/Repos/backstage/ai-crew-suite/yarn.lock`

### Tests added

- Reducer test for valid and malformed `impact-assessment` artifacts.

- Panel test covering:

  - owner rollup
  - clickable code evidence
  - truncation notice
  - visually/textually distinct `unknown` and `unaffected` outcomes

## Backend Completed

- AI Core backend module registration:

  - Agent: `search-ai-context`
  - Workflow: `cross-service-impact`
  - Manual trigger only
  - Read-only allow-list: repository search/read and knowledge retrieval
  - `memory: 'none'`

- Config parsing for `ai.agents.searchContext`, including bounded depth, consumer, tool, and capable-provider settings.

- Local `CatalogEntityResolver` adapter using `CatalogClient`, avoiding imports from sibling plugin private source.

- Deterministic impact workflow:

  - Validates versioned, scoped requests.

  - Checks source entity accessibility.

  - Traverses bounded catalog relation graphs.

  - Resolves consumer repositories from catalog integrations.

  - Runs code search for the requested symbol.

  - Correctly distinguishes:

    - `impacted` — positive textual code match.
    - `unaffected` — capable provider with zero matches.
    - `unknown` — no repository, unsupported provider, or failed search.

  - Emits an `impact-assessment` artifact.

  - Produces impacted-only, deterministic owner rollups.

- README documenting safety semantics and the currently deferred plan work.

- Tests:

  - Classification safety matrix, especially unsupported search providers never becoming `unaffected`.
  - Two-consumer workflow scenario: one match becomes impacted, one zero-match capable repository becomes unaffected.

### Monorepo registration

Updated:

- `/home/kevin/Repos/backstage/ai-crew-suite/tsconfig.json`
- `/home/kevin/Repos/backstage/ai-crew-suite/.eslintrc.cjs`
- `/home/kevin/Repos/backstage/ai-crew-suite/packages/backend/package.json`
- `/home/kevin/Repos/backstage/ai-crew-suite/packages/backend/src/index.ts`
- `/home/kevin/Repos/backstage/ai-crew-suite/app-config.yaml`
- `/home/kevin/Repos/backstage/ai-crew-suite/yarn.lock`

### Deliberately deferred

In line with the implementation plan and current runtime constraints, this initial backend slice does __not__ claim to support:

- Retrieval enrichment or file-context reads.
- Multiple query aliases/variant search expansion.
- Exact graph-hop calculation beyond resolver-bounded candidate traversal.
- Durable per-repository checkpoints and resume flow.
- Any write, ticket, PR, catalog mutation, or notification behavior.

## Definition of Done

- Package, agent, runner (`run` + `resume`), manual trigger, config schema, and the read-only allow-list implemented and registered (root + backend/app wiring included), with a barrel `index.ts` in every directory.
- Runs execute through the real AI Core controller/runtime with persisted replayable events, per-repository checkpoints, and `impact-assessment` artifacts.
- Traversal is bounded and cycle-safe via `CatalogEntityResolver.getRelations`, propagates `truncated` as a visible horizon, and annotates every consumer with hop distance and relation type.
- Every consumer is classified by **positive code-level verification**: `impacted` requires a cited match, `unaffected` requires a capable driver returning zero matches, and everything else is `unknown` with an explicit reason. No unverifiable consumer is ever reported `unaffected`.
- Severity and the per-owner rollup are pure, config-weighted, and deterministic; repeated runs over an unchanged catalog produce identical assessments.
- An interrupted validation pass resumes at the exact repository without re-crawling the catalog; a single failing repository never fails the run.
- The plugin registers **no write tool**, notifies nobody, and never writes assessments or code matches into vector storage.
- Frontend renders the dependency graph, classifications, code matches, and owner rollup over live SSE and replay via `ApiBlueprint`/`PageBlueprint`; `unknown` is visually distinct from `unaffected`, and Playwright verifies the impact and resume paths on fixtures.
- No output surface (SSE, artifacts, logs, tests) contains secrets from consumer repositories, unbounded snippets, uncited consumers, fabricated owners, or claims of proven breakage.
