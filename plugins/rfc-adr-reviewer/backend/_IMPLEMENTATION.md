# RFC / ADR AI Reviewer Implementation Plan

## Overview

This plugin automatically parses Request for Comments (RFCs) and Architecture Decision Records (ADRs) to flag design pattern deviations, security anomalies, and dependency mismatches.

- **The Task**: Providing automated, multi-perspective architectural and security gate feedback on new internal RFCs or Architecture Decision Records (ADRs) submitted across the engineering org.
- **The Logic**: When a new design document or ADR is detected (via a repository PR or a Backstage Software Template execution), a **Stateful Multi-Agent Review Loop** initializes. A **"Senior Architect" Agent Node** extracts the system design proposals and uses `knowledge.retrieve` to cross-reference them against live catalog dependencies and active API schemas. Concurrently, a **"Security Lead" Agent Node** parses the document against enterprise compliance rules. The runtime leverages **SSE structured streaming** to display the agents' multi-turn feedback debate natively in the Backstage UI before generating a final **Design Critique Artifact** and opening an automated feedback issue/PR.

## Goal

Implement `@ai-crew-suite/plugin-agent-rfc-adr-reviewer-backend` as an AI Core backend module that acts as an automated **architecture-governance gate** for RFCs/ADRs. When a design document is detected (repo PR touching `adr/`/`rfc/`, or a Scaffolder template event), it runs a **parallel multi-perspective review**: a **Senior Architect** node cross-references referenced components/APIs against the live catalog and standards via `knowledge.retrieve`, while a **Security Lead** node evaluates the document against enterprise compliance rules. A compilation node merges both critique channels into a single cited **Design Critique** artifact, streamed to the UI as a multi-turn debate over SSE, and — only after **human approval** — posts the critique back to the PR.

Reuse the architecture proven by `plugin-ai-agent-backend-catalog-ai-insights` (its `_IMPLEMENTATION.md` is the source of truth for repository conventions, workflow-runner mechanics, event contracts, monorepo wiring, and test-layer definitions). This plan documents only what differs: **parallel multi-agent fan-out/merge**, per-node structured SSE, event-trigger ingestion, and an approval-gated PR write.

## Delivery Boundary

### In scope

- Review one RFC/ADR document per run, via `/agents/rfc-adr-ai-reviewer/runs` and via an event-driven trigger.
- **Parallel** Senior Architect + Security Lead nodes writing into a shared critique-state channel, merged by a deterministic compilation node.
- Bounded reads: document source, catalog validation of referenced entities, compliance/architecture policy evaluation, and semantic standards retrieval — all through registered read-only AI Core tools.
- Per-node structured SSE so the frontend can render each perspective's turns (`node:senior-architect`, `node:security-lead`, `node:compilation`).
- A structured, citation-required `DesignCritique` artifact plus streaming run events.
- **Approval-gated** posting of the critique as a PR comment (write). Draft-only when the write tool/approval are unavailable.

### Explicitly out of scope for v1

- **Autonomous PR/issue writes.** Posting the critique requires a human `approved` decision; event-triggered runs pause at the draft/approval gate.
- Blocking or merging PRs, changing branch protection, or acting as a required status check that hard-fails CI (v1 is advisory).
- Editing the RFC/ADR document itself or committing changes.
- Multi-document / whole-repo governance sweeps; one document per run.

## Required Prerequisites

Contracts verified against the current codebase. As with the catalog plan: no fictional service refs — the foundation doc's `github.service` (`getPrFileContent`/`postPrComment`) `createServiceFactory` sketch must not be implemented; use registered tool IDs through the workflow context.

**Two hard gates:** (a) the built-in crew orchestrator is **sequential**, so parallel review needs a custom workflow runner; (b) there is **no VCS write-comment tool** today.

| Capability | Required contract | Current state | Required action |
| --- | --- | --- | --- |
| Read the RFC/ADR source | `vcs.repository.read_file`, `vcs.repository.get_metadata` | Exist, `effect: read` | Read the changed doc at the PR ref; bound file size. |
| List/locate the doc in a PR | `vcs.pull_request.list` | Exists, `effect: read`; driver lacks per-file/diff ops | Identify the target doc from PR metadata; add a generic changed-files read op to `VcsDriver` only if PR listing is insufficient. |
| Validate referenced entities | `CatalogEntityResolver` semantic helpers in `plugin-ai-core-node/src/catalog/` | **Not present** (introduced by catalog-ai-insights; still unbuilt) | Build the interface + pure mapping in core (shared work); implement the `catalogServiceRef` adapter here to check existence/lifecycle (e.g. `deprecated`). |
| Architecture/compliance evaluation | `compliance.architecture.validate`, `compliance.policy.evaluate`, `compliance.permission.check` | Exist, `effect: read` (compliance module, OPA driver) | Security Lead node calls these; degrade when no driver is configured. |
| Standards/prior-ADR retrieval | `knowledge.retrieve` + `DefaultRetrievalPipeline` | Exists | Both nodes retrieve standards/policies/prior ADRs; scope filters + cap chunks. |
| **Parallel multi-node execution** | Custom `WorkflowRunner` (fan-out → shared state → merge) | **Built-in `CrewOrchestrator` is sequential** (`for` loop over roles) | Do **not** use `orchestrator: 'crew'`. Register a domain runner `rfc-adr-review` that runs the two nodes concurrently (`Promise.all`) and merges results. |
| **Per-node SSE tagging** | `AgentEvent` `token`/`step` with a node label | `step` carries `node`; `token` does **not** | Emit `step` `enter`/`exit` per node (already node-tagged) and attach node context to streamed text by extending `token` data with an optional `node` **generically**, never with RFC-specific fields. |
| **Post PR comment (write)** | `vcs.pull_request.comment` (**new, `effect: 'write'`**) | **Not present** — all `vcs.*` tools are `effect: read` | Add `commentOnPullRequest(repoUrl, prId, body)` to `VcsDriver` + a `vcs.pull_request.comment` tool (`effect: 'write'`) so AI Core's approval policy pauses before it runs. **Blocking for the write milestone.** |
| Human approval gate | `ApprovalRequest`/`ApprovalDecision`, `WorkflowRunner.resume()`, `CheckpointStore`, `AuditLogSink` | **Exist** | Emit `approval_request` before the comment; checkpoint; `resume()` posts or finalizes; audit the decision. |
| Event-trigger ingestion | `coreServices.events` (`EventsService`) | **Not consumed by AI Core today**; AI Core uses generic triggers + run routes | Subscribe in-module and translate matching repo/scaffolder events into authenticated run dispatches; do not add a bespoke webhook server. |
| Stateful runs, SSE, checkpoints | AI Core run controller + `workflowRunnerExtensionPoint` + runtime stores | Exist | Register runner `rfc-adr-review`; checkpoint before the gate. |

## Package Shape

Backend module from the same template as catalog-ai-insights; only the domain directories differ:

```text
plugins/backend/plugin-ai-agent-backend-rfc-adr-ai-reviewer/
  package.json          # role: backend-plugin-module, pluginId: ai-core
  tsconfig.json
  config.d.ts
  README.md
  src/
    index.ts
    module.ts           # registers runner, agent, triggers, event subscription
    agent.ts            # RFC_ADR_REVIEWER_AGENT_ID, tool allow-list, node prompts
    config.ts           # readRfcAdrReviewerConfig (ai.agents.rfcAdrReviewer)
    workflow/
      ReviewGraph.ts            # WorkflowRunner id 'rfc-adr-review' (run + resume)
      state.ts                  # ReviewState with shared critique channel
      document.ts               # RFC/ADR parse: proposals, referenced entities, refs
      nodes/
        seniorArchitect.ts      # architecture/catalog critique node
        securityLead.ts         # compliance/security critique node
        compile.ts              # deterministic merge -> DesignCritique
      critique.ts               # DesignCritique schema, validation, degradation
      publish.ts                # approval-gated PR-comment step
    triggers/
      events.ts                 # coreServices.events subscription -> run dispatch
      normalizeEvent.ts         # repo/scaffolder event -> ReviewRequest
    retrieval/
      StandardsRetriever.ts     # knowledge.retrieve wrapper (standards/prior ADRs)
    services/
      CatalogRefValidator.ts    # catalogServiceRef adapter behind CatalogEntityResolver
      ReviewToolRunner.ts       # capped invokeTool facade
      CritiqueArtifactWriter.ts
    __tests__/
    workflow/__tests__/
    workflow/nodes/__tests__/
    triggers/__tests__/
    retrieval/__tests__/
    services/__tests__/
```

- `createBackendModule` with `pluginId: 'ai-core'`, `moduleId: 'agent-rfc-adr-ai-reviewer'`.
- `module.ts` deps: `coreServices.rootConfig`, `logger`, `events`, `discovery`, `auth`, `catalogServiceRef`, plus `agentExtensionPoint`, `triggerExtensionPoint`, `workflowRunnerExtensionPoint`.
- Package naming, scripts, Apache header, root `tsconfig.json` references, and `.eslintrc.cjs` role overrides follow catalog-ai-insights and `plugin-registration.md` verbatim (not repeated here).

## Monorepo And App Wiring

Same delegated-but-verified steps as catalog-ai-insights (see that plan's "Monorepo And App Wiring"). Deltas:

- **Backend load**: add `"@ai-crew-suite/plugin-agent-rfc-adr-reviewer-backend": "workspace:^"` to `packages/backend/package.json` and `backend.add(loadBackendFeature(import('@ai-crew-suite/plugin-agent-rfc-adr-reviewer-backend')))` in `packages/backend/src/index.ts`.
- **VCS module gate**: PR-comment posting requires the new `vcs.pull_request.comment` write tool (see Prerequisites); the VCS module must be extended and loaded before the write milestone. Draft-only runs work without it.
- **Events wiring**: the module subscribes to `coreServices.events`; ensure whatever repo/scaffolder event source is configured publishes onto the Backstage event bus. No new HTTP webhook endpoint is added by this plugin.
- **App config**: throws at boot without `ai.agents.rfcAdrReviewer.model`; add the config block (see Configuration). Posting additionally requires `ai.agents.rfcAdrReviewer.publish.enabled: true`.
- **Frontend registration**: add `"@ai-crew-suite/plugin-agent-rfc-adr-reviewer": "workspace:^"` to `packages/app/package.json`, import its `/alpha` default export in `packages/app/src/App.tsx`, and extend plugin-ID expectations in `packages/app/src/App.test.tsx`.
- **Yarn PnP refresh**: `yarn install`, then `yarn typecheck --force` / `yarn lint --force`.

## Agent Definition

```ts
{
  id: 'rfc-adr-ai-reviewer',
  modelRef: config.modelRef,          // installation-registered ID, e.g. 'rfc-adr-review'
  workflowRef: 'rfc-adr-review',      // custom parallel runner, NOT orchestrator: 'crew'
  memory: 'none',                     // each document review is self-contained
  systemPrompt: RFC_ADR_REVIEWER_SYSTEM_PROMPT,  // base posture; node prompts specialize
  toolIds: [
    'vcs.repository.read_file',
    'vcs.repository.get_metadata',
    'vcs.pull_request.list',
    'compliance.architecture.validate',
    'compliance.policy.evaluate',
    'compliance.permission.check',
    'knowledge.retrieve',
    'vcs.pull_request.comment',       // effect: 'write' — NEW; only invoked post-approval
  ],
  triggers: [
    { id: 'rfc-adr-review-on-demand', source: 'manual', agentId: 'rfc-adr-ai-reviewer' },
    { id: 'rfc-adr-review-repo-event', source: 'events', agentId: 'rfc-adr-ai-reviewer' },
  ],
}
```

- **Why a custom `workflowRef`, not `crew`:** the built-in `CrewOrchestrator` executes roles sequentially in a `for` loop and cannot fan out. The parallel Architect+Security requirement (foundation doc diagram) needs the domain runner. Node-specific prompts/tool subsets live in `workflow/nodes/*`, not in the `AgentDefinition.crew` field.
- Read tools run freely. The single write tool `vcs.pull_request.comment` is `effect: 'write'`, so AI Core pauses with an `approval_request` before it runs — the plugin must not bypass this. Omit it from the allow-list until it lands; the workflow then terminates at the critique artifact.
- Base + node prompt rules: critique only from supplied evidence; the Architect cites catalog/standard evidence IDs, the Security Lead cites policy/compliance evidence IDs; every finding is `blocking | major | minor | info`; say "insufficient evidence" rather than speculate; never invent entity names, policy IDs, or CVees.

## Run Input Contract

The generic `AgentRunInput.input.query` carries a versioned JSON payload:

```ts
type ReviewRequest = {
  version: 1;
  source: 'manual' | 'events';
  repoUrl: string;              // required
  prId?: string;               // PR/MR identifier (required to post a comment)
  documentPath?: string;       // path to the ADR/RFC; else inferred from PR changed files
  ref?: string;                // commit/branch ref to read the document at
  entityRefs?: string[];       // optional pre-resolved referenced entities
};
```

Validation requires `repoUrl`, requires `prId` before any comment can be posted, bounds document size at read time, and rejects unknown versions.

## Review Workflow (Parallel Multi-Agent)

`ReviewGraph` registers as `WorkflowRunner` id `rfc-adr-review` and implements **both** `run()` and `resume()`. It realizes the foundation doc's fan-out/merge graph: two critique nodes execute concurrently into a shared state channel, a compilation node merges them, then an approval gate guards the PR write.

### Deterministic graph nodes

1. **document.ingest** — validate `ReviewRequest`; read the ADR/RFC via `vcs.repository.read_file` at `ref`; parse proposals, referenced entity names, and external refs (`document.ts`). Empty/oversized/unreadable doc → terminal `error`, no model calls.
2. **fan-out (parallel)** — run concurrently via `Promise.all`, each emitting node-tagged `step` enter/exit and node-tagged `token` streams:
   - **seniorArchitect** (`nodes/seniorArchitect.ts`): resolve each referenced entity via `CatalogRefValidator` (existence, `lifecycle: deprecated`, relations), call `compliance.architecture.validate`, and `knowledge.retrieve` architecture standards. Produces `CritiqueFinding[]` on the `architecture` channel.
   - **securityLead** (`nodes/securityLead.ts`): `compliance.policy.evaluate` + `compliance.permission.check` against the doc, and `knowledge.retrieve` security/compliance policies. Produces `CritiqueFinding[]` on the `security` channel.
   Both nodes are independent; a failure in one records a limitation and yields an empty channel without aborting the other (the foundation doc's graceful-merge requirement).
3. **compile.merge** — **deterministic** merge (`nodes/compile.ts`): concatenate both channels, dedupe, sort by severity, compute an overall gate verdict (`block | comment | approve`) from finding severities. No LLM decides the verdict; the model only phrases the summary. This satisfies the foundation doc's "merged state contains BOTH a deprecation error AND a security token error" assertion.
4. **critique.summarize** — one model call rendering the merged findings into a review comment (Markdown) with per-finding citations to `arch-N` / `sec-N` evidence IDs. Invalid/uncited output degrades to a deterministic finding list. Emits the `design-critique` artifact.
5. **approval.gate** — if `prId` is present and `vcs.pull_request.comment` is available and `publish.enabled`, emit `approval_request` (`effect: 'write'`), persist a checkpoint, and **suspend**. Event-triggered and comment-less runs skip the gate and finish at the artifact.
6. **publish** *(resume path)* — `resume(runId, decision, context)`: on `approved`, post the critique via `vcs.pull_request.comment`, emit a `critique-publication` artifact + audit entry, then `done`; on `rejected`, finalize without posting.

### State and critique schema

```ts
type CritiqueFinding = {
  id: string;                     // 'arch-1' | 'sec-1' ...
  perspective: 'architecture' | 'security';
  severity: 'blocking' | 'major' | 'minor' | 'info';
  title: string;
  detail: string;                 // redacted, bounded
  evidence: string[];             // citation IDs: catalog/standard/policy refs
  reference?: string;             // deep link (entity page, policy, prior ADR)
};

// ReviewState (shared channel): { request, document, findings: {
//   architecture: CritiqueFinding[]; security: CritiqueFinding[] },
//   limitations: string[] } — nodes append to their own channel only.

type DesignCritique = {
  repoUrl: string;
  prId?: string;
  documentPath?: string;
  verdict: 'block' | 'comment' | 'approve';   // deterministic from severities
  status: 'reviewed' | 'partial' | 'insufficient_evidence';
  findings: CritiqueFinding[];    // merged, severity-sorted
  summaryMarkdown: string;        // the comment body
  limitations: string[];
};
```

## Structured Streaming (Per-Node SSE)

New structural concern — the foundation doc requires the UI to render the two perspectives' turns distinctly.

- Emit `step` `{ node: 'senior-architect' | 'security-lead' | 'compilation', phase }` at each node boundary — `step` already carries `node`, so this needs no contract change.
- For streamed model text, extend the generic `token` event data with an **optional** `node` label in `plugin-ai-core-node` (`{ type: 'token', data: { runId, text, node? } }`). This is a generic, backward-compatible addition usable by any future multi-node workflow — not an RFC-specific event type.
- The two parallel nodes interleave tokens on the same SSE stream; the frontend demultiplexes by the `node` tag. Ordering within a node is preserved; cross-node ordering is best-effort (parallel by design).
- Tests assert the stream contains distinctly tagged segments for `node:senior-architect` and `node:security-lead` before the `compilation` step and final artifact.

## Event-Trigger Ingestion (New Structural Section)

- `triggers/events.ts` subscribes to `coreServices.events` for repo PR events (and optional Scaffolder template events). `normalizeEvent.ts` filters to events whose changed paths match `documentGlobs` (default `adr/**`, `docs/adr/**`, `rfc/**`) and maps them to a `ReviewRequest`.
- On match, the module dispatches an authenticated run via `auth.getPluginRequestToken` + `discovery.getBaseUrl('ai-core')` to `/agents/rfc-adr-ai-reviewer/runs` with `source: 'events'`. It does **not** run the graph in-process — event runs are persisted, replayable, and auditable like manual runs.
- **Event runs never auto-post**; they always stop at the draft/approval gate. This keeps the governance gate advisory and human-controlled in v1.
- Guardrails: dedupe by `(repoUrl, prId, headSha)` to avoid re-reviewing on every push (deduplication ledger keyed to the run store); config kill switch `events.enabled` (default **false**).

## Vector Store Integration

- **No new vector infrastructure.** Both critique nodes consume the existing `knowledge.retrieve` contract for org standards, security policies, and prior ADRs. Indexing/storage stay owned by `plugin-ai-core-backend-module-retrieval-augmenter` (pgvector/qdrant); runtime/checkpoint state by `plugin-ai-core-backend-module-runtime-store`.
- `StandardsRetriever` builds per-perspective queries (architecture standards vs security policies), scopes with source filters, and caps chunks per node so a single review cannot exhaust tokens.
- Retrieval conditions critique quality but never the deterministic merge verdict. Tests mock `context.invokeTool` for `knowledge.retrieve` with pre-baked standards/ADR fixtures keyed by query substring.

## Configuration

```yaml
ai:
  agents:
    rfcAdrReviewer:
      model: rfc-adr-review       # installation-registered model ID, required
      maxDocumentBytes: 65536     # optional, default 64 KiB
      maxReferencedEntities: 50   # optional, default 50
      maxFindings: 40             # optional, default 40
      maxToolInvocations: 24      # optional, default 24 (across both parallel nodes)
      maxRetrievalChunksPerNode: 6 # optional, default 6
      documentGlobs:              # optional; event path filters
        - 'adr/**'
        - 'docs/adr/**'
        - 'rfc/**'
      publish:
        enabled: false            # optional, default false; gates vcs.pull_request.comment
      events:
        enabled: false            # optional, default false; gates event-triggered runs
```

`config.ts` mirrors `readCatalogAiInsightsConfig`: throw when the section or `model` is absent; document all defaults in `config.d.ts`. Posting requires **both** `publish.enabled: true` and the `vcs.pull_request.comment` tool being registered.

## Shared AI-Core Work To Build First

- **`CatalogEntityResolver` (shared, still unbuilt)** — introduced by the catalog-ai-insights plan; this plugin is a second consumer (entity existence/lifecycle validation). Build the interface + pure mapping in `plugin-ai-core-node/src/catalog/` if catalog-ai-insights has not landed it; implement the `catalogServiceRef` adapter as `services/CatalogRefValidator.ts` here.
- **VCS write-comment contract (blocking for publish)** — add `commentOnPullRequest(repoUrl, prId, body)` to `VcsDriver` and register `vcs.pull_request.comment` (`effect: 'write'`) in `plugin-ai-core-backend-module-vcs`. Provider-neutral (GitHub/GitLab/Bitbucket/Azure). Shared with future PR-writing workflows.
- **Generic per-node `token` field** — extend the `token` `AgentEvent` with an optional `node` label in `plugin-ai-core-node`. Backward-compatible; reusable by any multi-node workflow. Do not add an RFC-specific event type.
- **No new approval or parallel-execution machinery in core** — approval types/`resume()`/checkpoint/audit already exist; parallelism lives inside this plugin's `ReviewGraph` (`Promise.all`), not in AI Core. `CrewOrchestrator` stays the sequential built-in.

## Frontend Plan

Mirror the catalog-ai-insights frontend layout and wiring (new-frontend-system `alpha.ts`, `extensions/`, self-contained wire types in `@types/`, SSE client over `discoveryApi.getBaseUrl('ai-core')` with `eventsource-parser` and `Last-Event-ID` replay). The distinguishing UI is the **two-column parallel debate view**.

```text
plugins/frontend/plugin-ai-agent-frontend-rfc-adr-ai-reviewer/
  src/
    index.ts
    alpha.ts
    plugin.ts
    routes.ts                     # rootRouteRef for the standalone review page
    @types/index.ts               # ReviewRequest/DesignCritique wire types
    api/
      apiRef.ts
      client.ts                   # RfcAdrReviewerClient: startReview(), streamRunEvents(), submitApproval()
      index.ts
    hooks/
      useReviewRun.ts             # pure reducer demultiplexing per-node token streams
    components/
      index.ts
      ReviewPage.tsx              # standalone: start review + critique history
      StartReviewDialog.tsx       # repoUrl/prId/documentPath inputs
      DebateView.tsx              # two columns: Senior Architect | Security Lead, live
      CritiquePanel.tsx           # merged findings by severity + verdict badge
      FindingCard.tsx             # severity, perspective, citations
      ApprovalBar.tsx             # approve/reject the PR comment
      PublicationBanner.tsx       # posted-comment link on success
    extensions/
      api.ts
      components.ts
    __tests__/
```

Frontend deltas vs catalog-ai-insights:

- `backstage.pluginId: 'rfc-adr-ai-reviewer'`; package `@ai-crew-suite/plugin-agent-rfc-adr-reviewer`.
- Primary surface is a **standalone page**; optionally a catalog entity-page tab for the design repo.
- `useReviewRun` **demultiplexes the SSE stream by the `token.node` tag**, feeding two live columns in `DebateView` — the headline UX from the foundation doc. Falls back to a single column if `node` is absent.
- `startReview()` POSTs `/agents/rfc-adr-ai-reviewer/runs` with the JSON `ReviewRequest`; critique renders from the `design-critique` artifact; `verdict` shows as a badge (`block`/`comment`/`approve`).
- **Approval UX**: on `approval_request`, render `ApprovalBar`; `submitApproval()` posts an `ApprovalDecision` to the resume route. On approve, `PublicationBanner` links the posted PR comment; on reject, critique shows as final-unposted.
- Render `status` and `limitations` prominently; every finding shows its citations.

## Test Strategy

Reuse the catalog plan's test-layer table and network policies. Deltas only:

- **Unit**: `document.ts` parsing (proposals, referenced entities, refs, size bounds); `nodes/compile.ts` merge/dedupe/severity-sort/verdict derivation; `critique.ts` schema validation + uncited-output degradation; `normalizeEvent.ts` glob filtering + dedupe key.
- **Parallel workflow tests (headline)**: drive `ReviewGraph.run()` with a stubbed `WorkflowContext` whose `invokeTool` is a **dynamic mock router keyed by `toolId` + args** — the codebase-accurate replacement for the foundation doc's `github.service` `createServiceFactory` sketch. The signature scenario: a doc referencing a `deprecated` entity **and** an insecure `deprecated-legacy-vault` API with no token rotation must produce a merged critique containing **both** an architecture deprecation finding **and** a security finding, with the verdict reflecting the highest severity. Assert both nodes ran (node-tagged `step` events) and the merge is order-independent.
- **Graceful-degradation**: one node's tools fail (e.g. compliance driver absent) → its channel is empty with a limitation, the other node still contributes, run status is `partial`.
- **Per-node SSE tests**: subscribe to the stream and assert distinctly tagged `token`/`step` segments for `node:senior-architect` and `node:security-lead` arrive before the `compilation` step and the `design-critique` artifact (foundation doc's structured-streaming requirement).
- **Approval-gate tests**: run emits `approval_request` and **suspends** before any `vcs.pull_request.comment`; checkpoint persisted; `resume('approved')` posts exactly once + audit; `resume('rejected')` posts nothing; repeated approved resume does not double-post (idempotency by `(repoUrl, prId, run)`).
- **Event-trigger tests**: a matching PR event dispatches one authenticated run; non-matching paths are ignored; `events.enabled: false` suppresses dispatch; duplicate `headSha` is deduped; event runs never auto-post.
- **`knowledge.retrieve` isolation**: pre-baked standards/ADR fixtures; assert per-node retrieval without real vector search.
- **Backend integration**: `startTestBackend` with this module + AI Core + `mockServices.rootConfig` + `mockServices.database` + `mockServices.events`, asserting boot registration, parallel run→SSE order, checkpoint at the gate, resume flow, and artifact/audit persistence.
- **E2E**: extend the shared fixture profile with fixture VCS (incl. fixture `vcs.pull_request.comment`), compliance, and catalog tool modules; Playwright: start a review of a fixture ADR → watch the two-column debate → see merged findings + verdict → approve → assert publication banner; plus a reject path. Add `yarn test:e2e:rfc-adr-reviewer`.

## Security and Operational Guardrails

Catalog-ai-insights guardrails apply unchanged (identity propagation, redaction, tool/token/wall-clock caps, correlation IDs). RFC/ADR-reviewer-specific additions (write-capable + governance gate):

- **No PR comment without a persisted human `approved` decision**; the decision, `decidedBy`, target PR, and critique artifact ref are audit-logged.
- The comment target (repo + PR) is fixed at gate time and re-validated on resume; it cannot be altered by the resume payload.
- Event-triggered runs carry a service principal and **never** publish authority — a human always approves the posted comment.
- Enforce authorization: only users permitted to comment on the repo may approve; the critique is advisory and must never mutate branch protection or merge state.
- Redact secrets/tokens from the RFC/ADR body and tool outputs before they enter model context, SSE, artifacts, or audit records; cap document and per-node evidence sizes so a large design doc cannot exhaust tokens.
- Bound parallel fan-out: exactly the two defined nodes in v1; `maxToolInvocations` is enforced across both channels combined.

## Ordered Implementation Milestones

### Milestone 0: Shared helpers and schemas

- [ ] Build/confirm `CatalogEntityResolver` in `plugin-ai-core-node/src/catalog/` (shared with catalog-ai-insights).
- [ ] Add the generic optional `node` field to the `token` `AgentEvent` in `plugin-ai-core-node`.
- [ ] Define `ReviewRequest`, `CritiqueFinding`, `DesignCritique`, and the config schema; implement + unit-test `document.ts`, `nodes/compile.ts`, `normalizeEvent.ts`.

Exit criteria: merge/verdict logic and parsing pass deterministically; schemas validate fixtures.

### Milestone 1: Parallel review backend (read-only)

- [ ] Scaffold package, register runner/agent/manual trigger, implement config parsing; register in root `tsconfig.json` + `.eslintrc.cjs`.
- [ ] Implement `ReviewGraph` fan-out (`Promise.all`) with the two nodes, shared-channel merge, summarize, and `design-critique` artifact (no publish yet).
- [ ] Wire the module into `packages/backend` and add the `ai.agents.rfcAdrReviewer` config block.
- [ ] Add unit, parallel-workflow, per-node SSE, and backend integration tests.

Exit criteria: parallel review + merged critique passes deterministically with no real LLM/service and no write tool.

### Milestone 2: Event ingestion + write approval gate

- [ ] Implement `coreServices.events` subscription, glob filtering, dedupe, and authenticated run dispatch (draft-only).
- [ ] Extend `VcsDriver` + module with `vcs.pull_request.comment` (`effect: 'write'`); implement the approval gate, `resume()` post/reject, audit, idempotency.
- [ ] Event-trigger + approval-gate tests, including no-double-post and reject-leaves-PR-untouched.

Exit criteria: event runs stop at the gate; comment posts only after `approved`; full run→gate→resume→post path proven in the test backend.

### Milestone 3: Frontend + E2E

- [ ] Implement the frontend (start review, two-column debate demux, critique panel/verdict, approval bar, publication banner) and register it in `packages/app`.
- [ ] Component tests (loading, dual-node streaming, approval request, approve/reject, reconnect/replay) + accessibility checks.
- [ ] Extend the E2E fixture profile and add Playwright approve and reject scenarios with screenshot review.

Exit criteria: `yarn test:e2e:rfc-adr-reviewer` demonstrates the parallel debate, merged verdict, and both approve→post and reject→no-post paths in a browser without external infrastructure.

### Milestone 4: Production readiness

- [ ] Document model registration, VCS/compliance/catalog driver configuration, event-source setup, publish enablement, and approval permissions.
- [ ] Dashboards/alerts for failed runs, per-node failure rate, approval latency, comment-post failures, and token/cost.
- [ ] Opt-in real-model evaluation suite (grounding: every finding cites supplied evidence IDs; verdict matches finding severities; no fabricated entities/policies) within budget.

Exit criteria: staged rollout with publish + events disabled by default, bounded costs, verified approval auditing and citation grounding.

## Definition of Done

- Package, agent, custom parallel runner (`run` + `resume`), triggers (manual + events), config schema, read allow-list, and the gated `vcs.pull_request.comment` write tool implemented and registered (root + app/backend + VCS-module + core `token`-field wiring included).
- Runs execute through the real AI Core controller/runtime with parallel node execution, persisted replayable per-node events, checkpoints at the gate, token/cost usage, and `design-critique` / `critique-publication` artifacts.
- The deterministic merge provably contains findings from **both** nodes and derives the verdict from severities; the approval gate provably blocks the PR comment until an `approved` decision and never double-posts.
- Event-triggered runs are draft-only; frontend renders the two-column debate and approve/reject gate over live SSE and replay; Playwright verifies both approve and reject paths.
- No output surface (SSE, artifacts, logs, audit, tests) contains secrets, uncited model claims, or a PR write lacking a recorded human approval.

## Frontend Completed

Implemented the RFC/ADR reviewer frontend plugin at:

`/home/kevin/Repos/backstage/ai-crew-suite/plugins/frontend/plugin-ai-agent-frontend-rfc-adr-ai-reviewer`

### Package shape

- Package: `@ai-crew-suite/plugin-agent-rfc-adr-reviewer`
- `backstage.role: frontend-plugin`, `backstage.pluginId: rfc-adr-ai-reviewer`
- Exports `.` (legacy plugin) and `./alpha` (new frontend system)
- One folder per component under `src/components/`, each with its own barrel and
  sibling `__tests__/` directory

### Implemented surfaces

- `ReviewPage` — standalone page at `/rfc-adr-ai-reviewer`, with `?run=<id>`
  deep-link replay and URL reflection of the active run
- `StartReviewDialog` — repository URL, document path (client-side `adr/` or
  `rfc/` validation matching backend request validation), optional ref, optional
  pull-request ID
- `DebateView` — two-column live debate (Senior Architect | Security Lead),
  demultiplexed by the run event's optional `token.node` tag, collapsing to a
  single transcript when the stream is untagged
- `CritiquePanel` / `FindingCard` — merged findings sorted by severity with
  channel attribution, expanded citation evidence, and rendered limitations
- `ApprovalBar` / `PublicationBanner` — approval gate plus published and
  rejected outcomes
- `useReviewRun` — pure exported reducer plus hook managing start, replay, and
  approval submission

### Typed API client

`RfcAdrReviewerClient` speaks to the shared AI Core endpoint
(`ai.endpointPath`, default `ai-core`) with `eventsource-parser`:

- `startReview()` → `POST agents/rfc-adr-ai-reviewer/runs` with a versioned
  `ReviewRequest` in `input.query`
- `streamRunEvents()` → `GET runs/<id>/events` with `Last-Event-ID` replay
- `submitApproval()` → `POST runs/<id>/approvals`

### Contract fidelity

Wire types in `src/@types/` mirror the **implemented** backend contract exactly
(`ReviewRequest` with `path`/`ref`/`pullRequestId`, `ReviewFinding` channels
`senior-architect`/`security-lead`, severities `critical|high|medium|low`,
verdicts `block|comment|approve`, `design-critique` artifact kind). No
speculative backend fields were invented; the approval and
`critique-publication` surfaces exist as typed, currently-unexercised paths for
the write milestone and stay hidden during draft-only runs.

### Wiring added

- `/home/kevin/Repos/backstage/ai-crew-suite/tsconfig.json`
- `/home/kevin/Repos/backstage/ai-crew-suite/.eslintrc.cjs`
- `/home/kevin/Repos/backstage/ai-crew-suite/packages/app/package.json`
- `/home/kevin/Repos/backstage/ai-crew-suite/packages/app/src/App.tsx`
- `/home/kevin/Repos/backstage/ai-crew-suite/packages/app/src/App.test.tsx`
- `/home/kevin/Repos/backstage/ai-crew-suite/yarn.lock`

### Tests added

19 tests across 6 files:

- `useReviewRun`: per-node demultiplexing, untagged fallback, merged critique
  from both channels, approval suspend/clear, rejection, terminal error and
  malformed-artifact resilience
- `DebateView`: two live columns, empty-perspective state, untagged collapse
- `CritiquePanel`: verdict badge, severity ordering, citation expansion,
  missing-evidence labelling, limitations
- `StartReviewDialog`: trimmed submission, `adr/`/`rfc/` rejection
- `ApprovalBar`: approve with note, reject without note
- `PublicationBanner`: hidden, published link, rejected-unposted

### Still out of scope here

Milestone 3's Playwright E2E scenarios and the shared fixture profile were not
added; the backend still has no write tool or event trigger, so an approve/reject
browser path cannot be exercised end to end yet.

## Backend Completed

### Implemented: read-only parallel-review milestone

The module now provides a custom AI Core workflow runner:

- Workflow ID: `rfc-adr-review`

- Agent ID: `rfc-adr-ai-reviewer`

- Manual trigger registration

- Read-only tool allow-list:

  - `vcs.repository.read_file`
  - `vcs.repository.get_metadata`
  - `compliance.architecture.validate`
  - `compliance.policy.evaluate`
  - `knowledge.retrieve`

### Workflow behavior

1. Validates one RFC/ADR request:

   - repository URL
   - `adr/` or `rfc/` document path
   - optional ref / pull-request ID

2. Reads and redacts the document with a configurable size cap.

3. Runs two independent review channels concurrently with `Promise.all`:

   - __Senior Architect__: standards retrieval and architecture/deprecation findings
   - __Security Lead__: architecture/compliance policy findings

4. Emits independently tagged workflow steps:

   - `senior-architect`
   - `security-lead`
   - `compilation`

5. Deterministically merges cited findings and derives the verdict:

   - `block` for critical/high findings
   - `comment` for lower-severity findings
   - `approve` when no cited findings remain

6. Emits a replayable `design-critique` artifact.

### Safety and current contract limitations

The implementation plan correctly identifies three missing shared contracts:

- `vcs.pull_request.comment` write tool
- `CatalogEntityResolver`
- confirmed event-service subscription integration

Those features were __not fabricated__.

The current module is explicitly:

- read-only
- manual-triggered
- draft-only
- advisory

If `publish.enabled` is configured, the critique records a limitation explaining that PR commenting is unavailable. It does not emit a fake approval request or attempt a PR mutation.

### JSDoc and formatting

New source files include:

- Apache 2026 license headers
- JSDoc for exported types, classes, functions, configuration, artifacts, and workflow contracts
- readable named helpers for request parsing, document redaction, reference extraction, verdict derivation, and bounded tool execution

### Wiring added

Registered the module in:

- `/home/kevin/Repos/backstage/ai-crew-suite/tsconfig.json`
- `/home/kevin/Repos/backstage/ai-crew-suite/.eslintrc.cjs`
- `/home/kevin/Repos/backstage/ai-crew-suite/packages/backend/package.json`
- `/home/kevin/Repos/backstage/ai-crew-suite/packages/backend/src/index.ts`
- `/home/kevin/Repos/backstage/ai-crew-suite/app-config.yaml`
- `/home/kevin/Repos/backstage/ai-crew-suite/yarn.lock`

### Tests added

- Merge findings from both channels and derive a blocking verdict from high severity
- Extract component/API references and redact secret-like document values
- Module registration, workflow ID, agent profile, and manual trigger coverage
