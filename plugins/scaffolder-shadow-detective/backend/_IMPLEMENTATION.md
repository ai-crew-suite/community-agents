# Scaffolder AI Shadow Detective Implementation Plan

## Overview

This plugin audits deployed infrastructure assets against the Software Catalog, actively identifying orphaned or undocumented cloud resources that lack matching Scaffolder ancestry records.

- **The Task**: Identifying unregistered cloud infrastructure and autonomously migrating "shadow IT" resources into governed Backstage Software Catalog components.
- **The Logic**: A stateful **Multi-Agent Reconciliation Loop** executes scheduled deep infrastructure audits. A **Scout Agent Node** utilizes cloud provider tool packs to inventory live cloud resources (e.g., S3 buckets, RDS instances, EC2 clusters). A downstream **Archivist Agent Node** cross-references these assets against active Backstage Catalog entity bindings. If an orphaned resource is detected, the agent analyzes historical resource tags, billing codes, and creation logs to deduce ownership. Finally, a **Communicator Agent Node** pings the targeted team via the _Slack Tool Pack_, delivering a direct, pre-populated link to a **Backstage Scaffolder template** to safely register or decommission the asset.

## Goal

Implement `@ai-crew-suite/plugin-agent-scaffolder-shadow-detective-backend` as an AI Core backend module that closes the loop between live cloud infrastructure and the Software Catalog. A scheduled reconciliation run inventories cloud resources, deterministically filters out everything already bound to a catalog `Resource` via an infrastructure annotation, and for each genuine orphan infers likely ownership from tags, creator identity, and billing codes — resolving a creator email through the Backstage org graph to a current team. Each finding becomes a `ShadowResource` carrying a **pre-populated Scaffolder claim URL**, and — only after approval — an outreach message to the inferred owning team. A paired frontend plugin renders the shadow inventory, ownership confidence, and one-click claim links.

Reuse the architecture proven by `plugin-ai-agent-backend-catalog-ai-insights` (its `_IMPLEMENTATION.md` is the source of truth for repository conventions, workflow-runner mechanics, event contracts, monorepo wiring, and test-layer definitions). This plan documents only what differs: **cloud-vs-catalog reconciliation**, **evidence-ranked ownership inference**, **cursor-resumable long scans**, and a **dedupe ledger** that prevents repeat outreach.

## Delivery Boundary

### In scope

- A scheduled fleet reconciliation plus an on-demand single-provider scan, via `/agents/scaffolder-ai-shadow-detective/runs`.
- Deterministic `inventory → reconcile → infer → link → gate` graph. Registered-vs-orphan filtering, ownership scoring, and claim-URL construction are pure code; the model writes only the outreach copy and rationale.
- Bounded reads over cloud inventory, catalog `Resource` annotations, catalog `User`/`Group` org graph, and optional VCS creation history.
- Evidence-ranked `OwnershipHypothesis` per orphan, with an explicit `unknown` outcome when no evidence resolves.
- A `shadow-resource-report` artifact, a cursor-resumable scan checkpoint, and a persistent dedupe ledger keyed by resource fingerprint.
- Optional approval-gated outreach via `communication.message.post`, emitting a `shadow-outreach-record`.

### Explicitly out of scope for v1

- **Any cloud mutation.** No stop, delete, tag, or resize. The remediation path is a Scaffolder *link a human clicks*, never an agent action.
- **Catalog writes.** The agent does not register the resource itself; no catalog write tool exists (see Prerequisites) and auto-registering unowned infrastructure would defeat the review the workflow exists to create.
- Triggering the claim Scaffolder task. The plugin builds and delivers the URL; the human runs it (that flow belongs to `scaffolder-ai-intent`).
- Decommission recommendations presented as fact — v1 flags orphans and infers ownership; it does not assert an asset is safe to delete.
- Cost attribution beyond echoing provider-reported billing tags; no spend modeling.
- Autonomous outreach: messaging is opt-in, approval-gated, and dedupe-suppressed.

## Required Prerequisites

Contracts verified against the current codebase. As with the catalog plan: no fictional service refs — the foundation doc's `aws.service` (`describeAllRdsInstances`) and `slack.service` (`postMessageToTeam`) `createServiceRef` sketches must **not** be implemented as written.

**Hard gate — the cloud tools are unusable by an AI Core agent today.** This is the plugin's blocking dependency and it is worse than "read-only". `createCloudProviderTools` (`plugin-ai-core-backend-module-cloud-providers/src/registerTools.ts`) emits **LangChain-shaped** objects — `{ name: '<provider>_lookup_resource', description, execute(args) }` — and pushes them through `tools.addTool()` as `any[]`. AI Core's `Tool` contract (`plugin-ai-core-node/src/@types/tool.ts:43`) requires `{ id, description?, schema?, invoke(args, ctx) }`. So the registered cloud tools have **no `id`, no `invoke`, and no `effect`**: an agent allow-list keyed on `cloud.*` tool IDs cannot resolve them, and the runtime cannot invoke them. Normalizing this module is Milestone 0 and cannot be worked around inside this plugin.

| Capability | Required contract | Current state | Required action |
| --- | --- | --- | --- |
| **Cloud inventory (blocking)** | `cloud.resource.lookup` as a real `ToolDefinition` (`id`, `effect: 'read'`, `invoke`) | **Broken/legacy** — `createCloudProviderTools` emits `{ name, execute }` with no `id`/`invoke`/`effect`, registered as `any[]`; driver ops (`lookupAccount`, `lookupResource`, `resourceDependencies`) are read-only and correctly shaped | Normalize the module to `ToolDefinition` with IDs `cloud.account.lookup` / `cloud.resource.lookup` / `cloud.resource.dependencies`, `effect: 'read'`, and `invoke(args, ctx)`. **Shared with `scaffolder-ai-drift-detector`** — build once. **Blocking for the entire plugin.** |
| Inventory shape | `CloudResourceSummary` = `{ id, type, provider, region?, tags?, owner?, catalogEntityRef? }` | **Exists** and is well suited: `tags` carries the `created-by`/billing evidence, `catalogEntityRef` is the binding hint | Use `tags` as the inference substrate; treat `catalogEntityRef` as a *hint*, not proof — verify against the catalog. |
| Pagination for large scans | A cursor/continuation on `lookupResource` | **Not present** — `lookupResource(input)` returns `CloudResourceSummary[]` with no cursor or limit | Add optional `limit`/`cursor` to the driver op during normalization, or cap per-provider results and record truncation as a limitation. Required for the foundation doc's resumable-scan requirement. |
| Catalog binding check | `catalogServiceRef` adapter → `getEntities({ filter })` over `kind: Resource` annotations | Pattern **exists** (`CatalogContextResolver` defines `CatalogClientLike` with `getEntities`/`getEntityByRef` and `findByAnnotation`) | Reuse it. Query by the configured infrastructure annotation to build the registered-ARN set. |
| Org-graph ownership resolution | Catalog `User` lookup by `spec.profile.email`, then `spec.memberOf` → `Group` | **Exists** via the same adapter | This is the foundation doc's `dev-alpha@company.com` → `team-checkout` path, and the plugin's genuine differentiator over CSPM tooling. |
| Creation history (optional) | `vcs.repository.search` | Exists, `effect: read` | Weak supporting evidence when a resource name appears in IaC; never the sole basis for a hypothesis. |
| Claim URL construction | `coreServices.discovery` + a configured Scaffolder template ref | Available | Build the deep link deterministically (`/create/templates/<ref>?formData=...`). **No Scaffolder API call is needed** — this is URL assembly, not execution. |
| **Outreach (write)** | `communication.message.post` | **Exists**, `effect: 'write'` (communication module, Slack driver) | Replaces the invented `postMessageToTeam`. Because it is `effect: 'write'`, AI Core pauses with an `approval_request` before it runs. Absent driver → report-only, never a silent skip of the gate. |
| Channel resolution | `communication.channel.lookup` | Exists, `effect: read` | Resolve the inferred `Group` to a channel before outreach; unresolvable → outreach `skipped` with a reason. |
| **Catalog registration write** | A catalog write tool | **Not present** — no `catalog.*` tool is registered anywhere (only test fixtures reference `catalog.write`) | Out of scope by design; the Scaffolder claim link is the registration path. Do not invent one. |
| Dedupe ledger + scan cursor | AI Core runtime stores (runs/checkpoints/artifacts) | Exist | Track per-fingerprint outreach state and the in-flight scan cursor via runtime stores; do **not** hand-roll the foundation doc's bespoke dedupe table. |
| Approval gate | `ApprovalRequest` / `ApprovalDecision`, `WorkflowRunner.resume()`, `CheckpointStore`, `AuditLogSink` | **Exist** | Implement `ReconciliationGraph.resume()`; checkpoint the frozen outreach plan; audit decision, actor, and fingerprints notified. |
| Scheduled scans | `coreServices.scheduler` + `discovery` + `auth` | Available | In-module weekly cadence (foundation doc: Sunday 02:00), opt-in, globally mutexed. |

## Package Shape

Backend module from the same template as `catalog-ai-insights`; only the domain directories differ. Every directory carries a barrel `index.ts` re-exporting its public surface, matching the reference plugin's export styling.

```text
plugins/backend/plugin-ai-agent-backend-scaffolder-ai-shadow-detective/
  package.json          # role: backend-plugin-module, pluginId: ai-core
  tsconfig.json
  config.d.ts
  README.md
  src/
    index.ts            # barrel: module default + public types
    module.ts           # registers runner, agent, triggers, scheduler scan
    agent.ts            # SHADOW_DETECTIVE_AGENT_ID, tool allow-list, system prompt
    config.ts           # readShadowDetectiveConfig (ai.agents.shadowDetective)
    workflow/
      index.ts          # barrel
      ReconciliationGraph.ts    # WorkflowRunner id 'shadow-reconciliation' (run + resume)
      state.ts                  # ReconciliationState (cursor, inventory, orphans)
      inventory.ts              # cloud.* reads -> normalized CloudAsset[] + cursor
      fingerprint.ts            # pure: asset -> stable ResourceFingerprint
      reconcile.ts              # pure: assets + registered set -> orphans
      ownership.ts              # pure: evidence -> ranked OwnershipHypothesis[]
      claimLink.ts              # pure: orphan + template ref -> prefilled Scaffolder URL
      report.ts                 # ShadowResourceReport schema, validation, degradation
      outreach.ts               # approval-gated communication.message.post step
    scheduler/
      index.ts          # barrel
      weeklyScan.ts             # coreServices.scheduler registration (Sun 02:00)
      scanPlanner.ts            # pure: providers + caps -> bounded scan plan
    services/
      index.ts          # barrel
      CatalogBindingIndex.ts    # catalogServiceRef adapter: annotation -> registered set
      OrgGraphResolver.ts       # catalogServiceRef adapter: email -> User -> Group
      DedupeLedger.ts           # fingerprint -> outreach state via runtime stores
      ShadowToolRunner.ts       # capped invokeTool facade
      ShadowArtifactWriter.ts
    @types/
      index.ts          # barrel: shared asset/report contracts
    __tests__/
    workflow/__tests__/
    scheduler/__tests__/
    services/__tests__/
```

- `createBackendModule` with `pluginId: 'ai-core'`, `moduleId: 'agent-scaffolder-ai-shadow-detective'`.
- `module.ts` deps: `coreServices.rootConfig`, `coreServices.logger`, `coreServices.scheduler`, `coreServices.discovery`, `coreServices.auth`, `catalogServiceRef`, plus `agentExtensionPoint`, `triggerExtensionPoint`, `workflowRunnerExtensionPoint`. **No new core service keys are introduced.**
- Package naming, scripts, Apache header, root `tsconfig.json` references, and `.eslintrc.cjs` role overrides follow `catalog-ai-insights` and `plugin-registration.md` verbatim (not repeated here).

## Monorepo And App Wiring

Same delegated-but-verified steps as `catalog-ai-insights` (see that plan's "Monorepo And App Wiring"). Deltas:

- **Backend load**: add `"@ai-crew-suite/plugin-agent-scaffolder-shadow-detective-backend": "workspace:^"` to `packages/backend/package.json` and the matching `backend.add(loadBackendFeature(import(...)))` line in `packages/backend/src/index.ts`.
- **Cloud module gate (blocking)**: `plugin-ai-core-backend-module-cloud-providers` must be normalized to `ToolDefinition` **and** loaded with a provider driver module (`-aws` / `-gcp` / `-azure`) before this plugin does anything useful. Without it the agent's `cloud.*` allow-list entries fail to resolve at boot — which is the correct fail-fast behavior, not something to paper over.
- **Communication module gate**: outreach needs `plugin-ai-core-backend-module-communication` plus `-slack`. Absent, the report still generates and outreach targets are `skipped`.
- **App config**: the module throws at boot without `ai.agents.shadowDetective.model` and `claim.templateRef`; add the config block (see Configuration). Scans need `scan.enabled: true`; outreach needs `outreach.enabled: true`.
- **Frontend registration**: `plugins/frontend/plugin-ai-agent-frontend-scaffolder-ai-shadow-detective/` exists but is **empty** — scaffold it from scratch. Add the workspace dependency to `packages/app/package.json`, import its `/alpha` default export in `packages/app/src/App.tsx`, and extend plugin-ID expectations in `packages/app/src/App.test.tsx`.
- **Yarn PnP refresh**: `yarn install` after any `package.json` edit, then `yarn typecheck --force` / `yarn lint --force`.
## Agent Definition

```ts
{
  id: 'scaffolder-ai-shadow-detective',
  modelRef: config.modelRef,          // installation-registered ID, e.g. 'shadow-detective'
  workflowRef: 'shadow-reconciliation',
  memory: 'none',                     // each scan is a fresh inventory snapshot
  systemPrompt: SHADOW_DETECTIVE_SYSTEM_PROMPT,
  toolIds: [
    'cloud.resource.lookup',          // NORMALIZED shape required (see Prerequisites)
    'cloud.account.lookup',
    'cloud.resource.dependencies',
    'vcs.repository.search',
    'communication.channel.lookup',
    'knowledge.retrieve',
    'communication.message.post',     // effect: 'write' — only invoked post-approval
  ],
  triggers: [
    { id: 'shadow-scan-on-demand', source: 'manual', agentId: 'scaffolder-ai-shadow-detective' },
    { id: 'shadow-weekly-scan', source: 'scheduler', agentId: 'scaffolder-ai-shadow-detective' },
  ],
}
```

- Catalog reads go through the injected `catalogServiceRef` adapter, not a tool, matching `CatalogContextResolver`.
- `communication.message.post` is the single write tool and is `effect: 'write'`, so AI Core pauses with an `approval_request` before it executes. Omit it until the communication driver is configured; the workflow then terminates at the report (report-only mode).
- The `cloud.*` IDs above **do not resolve today**. Registering this agent before the cloud module is normalized fails fast at boot on an unknown allow-list entry — the intended behavior.
- System prompt rules: the orphan verdict, ownership ranking, confidence, and claim URL are supplied **pre-computed** and must be quoted verbatim; never assert ownership beyond the supplied hypothesis or invent a team, email, or ARN; cite `asset-N`/`cat-N`/`org-N`/`tag-N` evidence IDs for every claim; when confidence is `low` or ownership is `unknown`, say so plainly rather than guessing a team; never state or imply that a resource is safe to delete; write only the outreach message body and per-resource rationale.

## Run Input Contract

The generic `AgentRunInput.input.query` carries a versioned JSON payload:

```ts
type ShadowScanRequest = {
  version: 1;
  source: 'manual' | 'scheduler';
  providers?: ('aws' | 'gcp' | 'azure')[];  // default: configured providers
  resourceTypes?: string[];       // e.g. ['rds', 's3']; default all configured
  region?: string;               // narrow a manual scan
  cursor?: string;               // resume a truncated/interrupted scan
  notify?: boolean;              // request the outreach path (still gated); default false
  maxResources?: number;         // clamped by config
};
```

Validation clamps `maxResources` and `providers` to the configured set, rejects unknown resource types, and forces the outreach path through the approval gate regardless of caller.

## Reconciliation Workflow

`ReconciliationGraph` registers as `WorkflowRunner` id `shadow-reconciliation` and implements **both** `run()` and `resume()`. It realizes the foundation doc's sequential network: **Inventory Cloud → Cross-Reference Catalog → Infer Ownership → Dispatch Action**. Filtering, scoring, and link construction are deterministic; the model writes only prose.

### Deterministic graph nodes

1. **inventory** *(Scout)* — validate `ShadowScanRequest`; page cloud assets via `cloud.resource.lookup` through `ShadowToolRunner`, normalizing each into a `CloudAsset` (`asset-N` evidence) and computing a stable `ResourceFingerprint`. The **cursor is checkpointed after every page**, so an interruption resumes here without re-listing (the foundation doc's resilience requirement). Truncation at `maxResources` is a recorded limitation, not a silent cut.
2. **reconcile** *(Archivist)* — `CatalogBindingIndex` builds the registered set by querying `kind: Resource` entities for the configured infrastructure annotation, then `reconcile.ts` (pure, no LLM) partitions assets into `registered` and `orphans` by exact annotation match. The asset's own `catalogEntityRef` is treated as a hint and **verified** against the catalog rather than trusted. This is the foundation doc's "ignore `db-registered-01` because its ARN matches a catalog record" assertion — a set membership test, not an inference.
3. **infer** — for each orphan, `ownership.ts` (pure) ranks `OwnershipHypothesis[]` from ordered evidence classes: (a) an explicit `owner`/`team` tag resolving to a real `Group`; (b) a `created-by` email resolved through `OrgGraphResolver` (`User.spec.profile.email` → `spec.memberOf` → `Group`) — the foundation doc's `dev-alpha` → `team-checkout` path; (c) a billing/cost-center tag mapped via config; (d) weak IaC-mention evidence from `vcs.repository.search`. Each hypothesis carries its evidence IDs and a deterministic score; no evidence → `unknown`, never a guess.
4. **link** — `claimLink.ts` (pure) builds the pre-populated Scaffolder claim URL from `claim.templateRef` plus the asset's identifiers, and — when a hypothesis exists — resolves a target channel via `communication.channel.lookup`. `DedupeLedger` then marks each orphan `suppressed` when its fingerprint was already notified within `dedupeTtlDays` **and** its material state is unchanged. One model call writes per-resource rationale and the outreach body. Emits the `shadow-resource-report` artifact.
5. **gate** — when `notify` is requested, un-suppressed targets exist, `communication.message.post` is registered, and `outreach.enabled`, emit `approval_request` carrying the exact message set and target channels, checkpoint, and **suspend**. Report-only and fully-suppressed scans finish at the artifact.
6. **outreach** *(resume path)* — `resume(runId, decision, context)`: on `approved`, post each message via `communication.message.post`, record each fingerprint in the ledger, emit a `shadow-outreach-record` artifact plus audit entry, and finish `notified` (or `partially_notified` on per-message failure); on `rejected`, record the decision and finish `report_only` with nothing sent and the ledger untouched.

### State and output schema

```ts
type EvidenceRef = { id: string; source: 'cloud' | 'catalog' | 'org' | 'tag' | 'vcs' | 'knowledge'; summary: string; reference?: string };

type CloudAsset = {              // normalized from CloudResourceSummary
  id: string;                    // provider-native ID or ARN
  type: string;                  // 'rds' | 's3' | 'ec2' ...
  provider: 'aws' | 'gcp' | 'azure';
  region?: string;
  tags?: Record<string, string>; // redacted before use
  reportedOwner?: string;        // provider-reported, unverified
  reportedEntityRef?: string;    // asset's own hint; verified, not trusted
  evidence: string[];            // asset-N
};

type ResourceFingerprint = {
  key: string;                   // stable hash: provider + type + id
  materialState: string;         // hash of fields whose change justifies re-notify
};

type OwnershipHypothesis = {
  id: string;                    // 'own-1' ...
  groupRef?: string;             // 'group:default/team-checkout'
  userRef?: string;              // resolved creator, when known
  basis: 'owner_tag' | 'creator_email' | 'billing_code' | 'iac_mention';
  score: number;                 // deterministic, from the basis ordering
  evidence: string[];            // tag-N / org-N / cat-N / vcs-N
};

type ShadowResource = {
  asset: CloudAsset;
  fingerprint: ResourceFingerprint;
  hypotheses: OwnershipHypothesis[];   // ranked; empty means unknown
  confidence: 'high' | 'medium' | 'low' | 'unknown';
  claimUrl: string;              // pre-populated Scaffolder deep link
  targetChannel?: string;        // resolved outreach channel, when available
  suppressed?: { reason: 'recently_notified'; lastNotifiedAt: string };
  rationale: string;             // model copy; must cite evidence IDs
};

// ReconciliationState: { request, cursor?, scanned: number, registered: number,
//   orphans: ShadowResource[], limitations: string[],
//   status: 'report_only'|'awaiting_approval'|'notified'|'partially_notified'
//         |'no_orphans'|'truncated'|'partial' }

type ShadowResourceReport = {
  providers: string[];
  scanned: number;
  registered: number;            // filtered out by catalog binding
  orphans: ShadowResource[];
  suppressedCount: number;
  cursor?: string;               // set when the scan truncated
  status: ReconciliationState['status'];
  limitations: string[];
  evidence: EvidenceRef[];       // asset-N + cat-N + org-N (+ tag/vcs/kb) bundle
};

type ShadowOutreachRecord = {
  reportRef: string;             // artifact ref of the approved report
  approvedBy: string;
  sent: { fingerprint: string; channel: string; messageId?: string }[];
  skipped: { fingerprint: string; reason: string }[];
  failures: { fingerprint: string; reason: string }[];
  outcome: 'notified' | 'partially_notified';
};
```

Status mapping is fixed in code, not inferred: zero orphans → `no_orphans`; orphans found with outreach disabled or all suppressed → `report_only`; scan hit `maxResources` → `truncated` with a `cursor`; approved and every message sent → `notified`; approved with any failure → `partially_notified`; rejected → `report_only`. `confidence` derives from the top hypothesis `basis` (`owner_tag` → high, `creator_email` → medium, `billing_code`/`iac_mention` → low, none → `unknown`).

## Evidence-Ranked Ownership Inference (New Structural Section)

The foundation doc's differentiator over CSPM tooling is *human routing*, so the inference must be explainable and never fabricated.

- `ownership.ts` is pure: `(asset, orgIndex, config) => OwnershipHypothesis[]`. No AI Core, tool, or clock dependency, so every basis and tie-break is unit-testable on fixture assets.
- **Ordered evidence classes, not a model judgment.** `owner_tag` > `creator_email` > `billing_code` > `iac_mention`, each with a fixed score. The ordering is config-visible and the basis is recorded on every hypothesis, so a reviewer can see *why* a team was suggested.
- **Every hypothesis must resolve to a real catalog entity.** A tag naming `team-payments` yields a hypothesis only if `group:default/team-payments` exists; an unresolvable tag is recorded as evidence but produces no hypothesis. This prevents routing outreach to a team that no longer exists.
- The `creator_email` path is a two-hop catalog lookup (`User` by email → `memberOf` → `Group`) and is deliberately **medium** confidence: the creator may have changed teams, and the hypothesis records the resolved user so a human can judge.
- **`unknown` is a first-class outcome.** No evidence means no hypothesis, `confidence: 'unknown'`, and no outreach target — the resource still appears in the report for human triage. Guessing an owner is worse than admitting ignorance, because a wrong ping trains teams to ignore the channel.
- The model may only phrase the rationale; `report.ts` re-validates that its prose names no group, user, or ARN absent from the computed hypotheses.

## Dedupe Ledger And Outreach Suppression (New Structural Section)

The foundation doc is explicit that consecutive scans must not spam channels, and this is the behavior most likely to lose user trust if it misbehaves.

- `DedupeLedger` maps `ResourceFingerprint.key` → last-notified timestamp plus the `materialState` hash at that time, persisted in the **AI Core runtime stores**, not the foundation doc's hand-rolled dedupe table.
- **Two-part suppression.** A target is suppressed when it was notified within `dedupeTtlDays` **and** its `materialState` is unchanged. A material change (new tags, changed owner, type/region change) re-opens outreach even inside the TTL, because the situation genuinely differs.
- `materialState` deliberately **excludes** volatile fields (last-seen timestamps, metric values) so routine re-observation never counts as a change. Getting this wrong turns the ledger into a spam generator.
- The ledger is written **only on the resume path after a successful post** — never at report time. A rejected or failed outreach leaves the ledger untouched so the finding resurfaces next scan rather than being silently swallowed.
- Suppressed orphans still appear in the report marked `suppressed` with `lastNotifiedAt`, so the UI shows the full shadow inventory while the channel stays quiet. Suppression governs *messaging*, not *visibility*.
- Ledger entries expire after `dedupeTtlDays`, giving a natural re-notification cadence for genuinely ignored resources.

## Cursor-Resumable Scans (New Structural Section)

The foundation doc requires a mid-scan cloud timeout to resume at the catalog step without repeating the expensive inventory pass.

- The scan cursor lives in `ReconciliationState` and is **checkpointed after every inventory page**, so a crash or rate-limit loses at most one page.
- On resume, the graph re-enters at **reconcile** with the accumulated inventory rather than restarting **inventory** — precisely the foundation doc's requirement, and the reason inventory is a separate node from reconciliation.
- **Note the contract gap**: `lookupResource` currently returns a bare array with no cursor, so genuine pagination requires adding `limit`/`cursor` to the driver op during normalization. Until then the scan is capped at `maxResources` and reports `truncated` with a synthetic cursor (the provider/type boundary already completed) so the next run continues from there.
- Rate-limit and timeout errors are treated as **retryable truncation**, not failure: the run emits a partial report plus a cursor, and the caller (or next scheduled tick) continues. A hard driver error degrades that provider to a limitation while other providers still complete.
- Scans are bounded on three axes — `maxResources`, per-provider caps, and a wall-clock budget — so a fleet-wide audit cannot run unbounded against a cloud bill.

## Background Scheduler Tasks (Weekly Scan)

- `scheduler/weeklyScan.ts` registers one `coreServices.scheduler` task: `id: 'shadow-detective-weekly-scan'`, `frequency: { cron }` from config (default `0 2 * * 0` — Sunday 02:00, matching the foundation doc), bounded `timeout`, non-zero `initialDelay`, `scope: 'global'`.
- `scanPlanner.ts` (pure) turns configured providers/resource types into a bounded dispatch plan, one run per provider so a single failing provider does not lose the others.
- The task POSTs runs to `/agents/scaffolder-ai-shadow-detective/runs` via `auth.getPluginRequestToken` + `discovery.getBaseUrl('ai-core')` with `source: 'scheduler'`, `notify: true`. It never executes the graph in-process.
- **Scheduled scans stop at the approval gate and never message autonomously.** The service principal holds no approval authority, so an unapproved outreach plan simply expires as a pending artifact.
- Guardrails: global mutex (a scan in flight skips the tick), per-provider caps, sequential dispatch with delay, dedupe suppression, and kill switch `scan.enabled` (default **false**).

## Vector Store Integration

- **No new vector infrastructure.** `knowledge.retrieve` is a secondary path supplying org conventions — tagging standards, naming schemes, which billing codes map to which department — as cited `kb-N` context for the rationale and outreach copy. Indexing/storage remain owned by `plugin-ai-core-backend-module-retrieval-augmenter`; ledger/cursor state by `plugin-ai-core-backend-module-runtime-store`.
- Retrieval **must never** create or reorder an `OwnershipHypothesis`, alter a confidence, or affect the orphan verdict. Tests assert orphan sets and hypothesis rankings are byte-identical with retrieval enabled and disabled.

## Configuration

```yaml
ai:
  agents:
    shadowDetective:
      model: shadow-detective       # installation-registered model ID, required
      providers: ['aws']            # optional, default all configured cloud providers
      resourceTypes: ['rds', 's3', 'ec2']   # optional, default provider-supported set
      maxResources: 500             # optional, default 500 per run (scan cap)
      maxResourcesPerProvider: 250  # optional, default 250
      maxToolInvocations: 20        # optional, default 20
      scanTimeoutSeconds: 600       # optional, default 600 wall-clock budget
      catalog:
        annotation: 'amazonaws.com/arn'     # required: the binding annotation to match
        additionalAnnotations: []           # optional extra binding annotations
      ownership:
        ownerTagKeys: ['owner', 'team']            # optional
        creatorTagKeys: ['created-by', 'creator']  # optional
        billingTagKeys: ['cost-center']            # optional
        billingMap:                                # optional cost-center -> group ref
          CC-1042: group:default/team-checkout
      claim:
        templateRef: template:default/register-existing-resource  # required
        baseUrl: ''                 # optional; else derived via discovery
      dedupe:
        ttlDays: 14                 # optional, default 14 outreach cooldown
      scan:
        enabled: false              # optional, default false
        cron: '0 2 * * 0'           # optional, default Sunday 02:00
      outreach:
        enabled: false              # optional, default false; gates message.post
```

`config.ts` mirrors `readCatalogAiInsightsConfig`: throw when the section, `model`, `claim.templateRef`, or `catalog.annotation` is absent; document every default in `config.d.ts`. Outreach requires **both** `outreach.enabled: true` and the `communication.message.post` tool being registered. Validate at boot that every `billingMap` value parses as a group entity ref.

## Shared AI-Core Work To Build First

- **Normalize the cloud-providers module (blocking, and the largest task here)** — rewrite `createCloudProviderTools` to emit real `ToolDefinition` objects: stable IDs (`cloud.account.lookup`, `cloud.resource.lookup`, `cloud.resource.dependencies`), `effect: 'read'`, `invoke(args, ctx)` honoring `ctx.signal`, a declared `schema`, and typed registration instead of `any[]`. Add `limit`/`cursor` to `lookupResource` for pagination. **Shared with `scaffolder-ai-drift-detector`**, which needs the same normalization — build it once, in that module, not here.
- **Catalog adapter reuse** — `CatalogBindingIndex` and `OrgGraphResolver` follow the existing `CatalogContextResolver` shape (`CatalogClientLike` + `CatalogTokenProvider`); its `findByAnnotation` already covers the binding query. Promote to `plugin-ai-core-node/src/catalog/` if the shared `CatalogEntityResolver` lands first.
- **No new ledger, approval, or scheduling machinery** — approval types, `resume()`, checkpoints, audit, runtime stores, and the scheduler all exist; `fingerprint.ts`/`reconcile.ts`/`ownership.ts`/`claimLink.ts` are plugin-local pure modules.

## Frontend Plan

Mirror the `catalog-ai-insights` frontend layout and wiring exactly: `alpha.ts` composing extensions into a `createFrontendPlugin` `FrontendFeature`, `extensions/api.ts` using `ApiBlueprint.make({ params: defineParams => defineParams(createApiFactory({...})) })`, `extensions/components.ts` using `PageBlueprint.make({ name, params: { path, title, routeRef, loader } })` with lazy `import(...)` loaders, self-contained wire types in `@types/`, and an SSE client over `discoveryApi.getBaseUrl('ai-core')` with `eventsource-parser` and `Last-Event-ID` replay. Every directory carries a barrel `index.ts`. The package directory exists but is **empty** — scaffold it from scratch.

```text
plugins/frontend/plugin-ai-agent-frontend-scaffolder-ai-shadow-detective/
  src/
    index.ts                      # barrel: public components/api/types
    alpha.ts                      # createFrontendPlugin: pluginId + extensions
    plugin.ts                     # legacy-system plugin + routable extension
    routes.ts                     # ROOT_PATH + rootRouteRef
    @types/
      index.ts                    # ShadowScanRequest/Report/OutreachRecord wire types
    api/
      index.ts                    # barrel
      apiRef.ts                   # shadowDetectiveApiRef
      client.ts                   # ShadowDetectiveClient: startScan(), streamRunEvents(), submitApproval(), listReports()
    hooks/
      index.ts                    # barrel
      useShadowScan.ts            # pure reducer + hook (scan/approve/reject/reset)
      useShadowInventory.ts       # aggregated orphan list across recent reports
    components/
      index.ts                    # barrel
      ShadowInventoryPage.tsx     # standalone: orphan inventory + on-demand scan
      ShadowResourceTable.tsx     # resource, provider, type, confidence, owner, claim link
      RunScanDialog.tsx           # provider/type/region/notify inputs
      ScanRunView.tsx             # live node/tool progress from SSE, page cursor
      OwnershipEvidencePanel.tsx  # ranked hypotheses with basis + evidence citations
      ClaimLinkButton.tsx         # opens the pre-populated Scaffolder template
      OutreachApprovalBar.tsx     # approve/reject the exact message set
      OutreachSummary.tsx         # sent / skipped / failed per fingerprint
    extensions/
      api.ts                      # ApiBlueprint.make(...)
      components.ts               # PageBlueprint.make(...)
    __tests__/
```

Frontend deltas vs `catalog-ai-insights`:

- `backstage.pluginId: 'scaffolder-ai-shadow-detective'`; package `@ai-crew-suite/plugin-agent-scaffolder-shadow-detective`.
- Primary surface is a **standalone inventory page** (nav item) via `PageBlueprint`, since shadow resources have no catalog entity to attach a card to — that absence *is* the finding.
- **`ClaimLinkButton` is the payoff**: it navigates to the pre-populated Scaffolder template so the one-click resolution the foundation doc promises actually lands in the portal. It must be present even when ownership is `unknown`, so anyone can claim a resource.
- `OwnershipEvidencePanel` shows ranked hypotheses with `basis` and citations, never a bare team name — a suggested owner without visible reasoning is exactly the CSPM failure mode this plugin exists to fix.
- **Approval UX**: `OutreachApprovalBar` renders the exact message text and target channel per resource before sending, because the approver is authorizing outbound messages to other teams.
- `suppressed` resources render visibly but muted with `lastNotifiedAt`, making the dedupe behavior legible rather than mysterious.
- `unknown` confidence, `truncated` scans (with a resume affordance), and `no_orphans` render as first-class explained outcomes, not errors.

## Test Strategy

Reuse the `catalog-ai-insights` test-layer table (unit/contract/backend integration/runtime integration/LLM evaluation/full-stack E2E) and its network policies. Deltas only:

- **Unit (the highest-value layer here)**: `reconcile.ts` registered-vs-orphan partitioning, including an asset whose `reportedEntityRef` is set but *not* backed by a real catalog entity (must still be an orphan). `ownership.ts` basis ordering, tie-breaks, unresolvable-tag → no hypothesis, and empty evidence → `unknown`. `fingerprint.ts` stability across re-scans and `materialState` changing only on material fields. `claimLink.ts` URL/`formData` encoding. `scanPlanner.ts` caps.
- **Workflow (runtime) tests**: drive `ReconciliationGraph.run()` with a stubbed `WorkflowContext` (`invokeTool` mock router keyed by `toolId` + args) plus a fake catalog client — the codebase-accurate replacement for the foundation doc's `aws.service`/`slack.service` `createServiceRef` sketches. **Headline scenario (the foundation doc's own test)**: inventory returns `db-registered-01` (ARN annotated on a catalog `Resource`) and `db-shadow-99` (tags `{ 'created-by': 'dev-alpha@company.com' }`); catalog holds that `Resource` plus `User:dev-alpha` with `memberOf: ['team-checkout']`. Assert `db-registered-01` is filtered out, `db-shadow-99` resolves to `group:default/team-checkout` via the `creator_email` basis, the claim URL contains the configured template ref, the run **suspends** at `approval_request`, and `communication.message.post` was **never** called.
- **Dedupe tests** (the foundation doc's step D): after an approved outreach, a second consecutive scan over identical inventory marks the resource `suppressed`, dispatches **zero** messages, and still lists it in the report. Then mutate a material tag and assert outreach re-opens; mutate only a volatile field and assert it stays suppressed.
- **Cursor-resume tests**: fail the cloud tool mid-pagination and assert the cursor is checkpointed, the run reports `truncated`, and resuming continues at **reconcile** with the accumulated inventory **without** re-invoking the completed inventory pages.
- **Approval-gate hardening**: assert no message is sent when the model hallucinates a tool call or attempts to skip the gate; `resume('approved')` posts exactly once per target and writes the ledger; `resume('rejected')` posts nothing **and leaves the ledger untouched** (so the finding resurfaces); a repeated approved resume does not double-post.
- **Degradation tests**: cloud tool unavailable → boot-time allow-list failure (asserted explicitly, since that is the intended fail-fast); communication driver absent → report-only with outreach `skipped`; org-graph lookup failing → `unknown` confidence rather than a fabricated group.
- **`knowledge.retrieve` isolation**: pre-baked tagging-convention chunks; assert orphan sets, hypothesis rankings, and confidences are byte-identical with retrieval on and off.
- **Scheduler tests**: `mockServices.scheduler` fast-forwards to the Sunday tick; assert bounded authenticated per-provider dispatches, `scan.enabled: false` respected, in-flight mutex skipping, and **no autonomous message**.
- **Backend integration**: `startTestBackend` with this module + AI Core + `mockServices.rootConfig` + `mockServices.database`, plus a stub catalog client and normalized fixture `cloud.*` tools, asserting boot registration, run→SSE order, cursor checkpointing, resume flow, and report/outreach artifact persistence.
- **E2E**: extend the shared fixture profile with fixture `cloud.*` tools, catalog entities (a bound `Resource`, a `User`, a `Group`), and a fixture communication driver. Playwright: open the inventory page → run a scan → inspect ownership evidence → follow the claim link to the pre-filled template → approve outreach → assert the summary; plus a reject path and a suppressed-on-rescan path. Add `yarn test:e2e:scaffolder-ai-shadow-detective`.

## Security and Operational Guardrails

`catalog-ai-insights` guardrails apply unchanged (identity propagation, redaction before model/SSE/artifacts, tool/token/wall-clock caps, correlation IDs). Detective-specific additions:

- **No cloud mutation, ever.** Only `cloud.*` read tools are allow-listed and the remediation path is a link a human clicks. The agent cannot stop, delete, tag, or resize infrastructure.
- **No message without a persisted human approval.** The decision, `approvedBy`, target channels, and notified fingerprints are audit-logged; rejections are audited too. Scheduled scans reach the gate but cannot satisfy it.
- **Never fabricate an owner.** A hypothesis requires a resolvable catalog entity; absent evidence yields `unknown`. Mis-routed outreach is the fastest way to make teams ignore the channel, so silence beats a guess.
- **Cloud tags are untrusted and often sensitive.** Redact secret-shaped tag values (tokens, connection strings, keys) before they enter model context, SSE, artifacts, audit records, or an outreach message — tags are a common accidental secret store. Cap tag bytes per asset.
- Resource identifiers (ARNs, account IDs) are sensitive: keep them in the report artifact and the target team's channel, never in a broad channel, and never in `knowledge.retrieve` indexing.
- Outreach messages expose a team's infrastructure footprint — post only to the channel resolved for the inferred owning group, never a fallback broadcast channel.
- The claim URL is constructed deterministically from allow-listed template refs and encoded parameters; the model never supplies the URL, so it cannot direct users to an arbitrary destination.
- Scans respect provider rate limits with bounded pagination and treat throttling as truncation, so an audit cannot degrade production cloud APIs.

## Ordered Implementation Milestones

### Milestone 0: Normalize cloud tools and pure engines (blocking)

- [ ] Rewrite `createCloudProviderTools` to emit `ToolDefinition` objects (`cloud.account.lookup`, `cloud.resource.lookup`, `cloud.resource.dependencies`; `effect: 'read'`; `invoke(args, ctx)` honoring `ctx.signal`; declared `schema`; typed registration instead of `any[]`). Add `limit`/`cursor` to `lookupResource`. Confirm at least one provider driver implements the ops.
- [ ] Define `CloudAsset`, `ResourceFingerprint`, `OwnershipHypothesis`, `ShadowResource`, `ShadowResourceReport`, `ShadowOutreachRecord`, and the config schema.
- [ ] Implement + unit-test `fingerprint.ts`, `reconcile.ts`, `ownership.ts`, `claimLink.ts`, `scanPlanner.ts`.

Exit criteria: normalized cloud tools resolve and invoke through the AI Core runtime; orphan partitioning and ownership ranking are provably deterministic on fixtures.

### Milestone 1: Reconciliation backend (read-only, report only)

- [ ] Scaffold the package with a barrel `index.ts` in every directory, register the runner/agent/manual trigger, config parsing; register in root `tsconfig.json` + `.eslintrc.cjs`.
- [ ] Implement inventory → reconcile → infer → link → `shadow-resource-report`, with `CatalogBindingIndex` and `OrgGraphResolver`.
- [ ] Wire into `packages/backend` and add the `ai.agents.shadowDetective` config block.
- [ ] Add unit, workflow-scenario (mock router + fake catalog), and backend integration tests.

Exit criteria: the foundation doc's registered/shadow pair is partitioned correctly and `db-shadow-99` routes to `team-checkout` deterministically, with no real LLM, no cloud account, and no messages.

### Milestone 2: Cursor resumption and dedupe ledger

- [ ] Implement per-page cursor checkpointing, resume-at-reconcile, truncation reporting, and `DedupeLedger` with two-part suppression and TTL expiry.
- [ ] Cursor-resume and dedupe tests, including material-vs-volatile change discrimination.

Exit criteria: an interrupted scan resumes without re-listing; consecutive scans provably send nothing for unchanged resources while still reporting them.

### Milestone 3: Approval-gated outreach

- [ ] Implement the gate + `ReconciliationGraph.resume()`: checkpointed message set, `approval_request`, per-target posting via `communication.message.post`, ledger write on success only, `shadow-outreach-record` artifact, audit, and no-double-post idempotency.
- [ ] Gate-hardening tests: hallucinated tool call, node-skip attempt, double-resume, and rejection leaving the ledger untouched.

Exit criteria: a message is provably sent only after approval, once per target, with the ledger updated only on success.

### Milestone 4: Frontend and E2E

- [ ] Scaffold the empty frontend package (`ApiBlueprint` + `PageBlueprint`, inventory page, scan dialog, SSE run view, ownership evidence panel, claim-link button, approval bar, outreach summary) with barrel indexes, and register it in `packages/app`.
- [ ] Component tests (loading, streaming, no_orphans, truncated, unknown confidence, suppressed, awaiting approval, notified, partially_notified, replay) plus accessibility checks.
- [ ] Extend the E2E fixture profile and add Playwright scan, claim-link, approve, reject, and rescan-suppressed scenarios with screenshot review.

Exit criteria: `yarn test:e2e:scaffolder-ai-shadow-detective` demonstrates scan → evidence → claim link → approve → summary, plus reject and suppression paths, without external infrastructure.

### Milestone 5: Production readiness

- [ ] Document model registration, cloud driver configuration, the binding annotation choice, ownership tag conventions, claim-template authoring, scan/outreach enablement, and approver permissions.
- [ ] Dashboards/alerts for orphan count by provider, **ownership-resolution rate** (the key quality metric), unknown rate, suppression rate, scan duration/truncation rate, and token cost.
- [ ] Opt-in real-model evaluation suite (grounding: every rationale cites supplied evidence IDs; no invented groups, users, ARNs, or deletion advice) within budget.

Exit criteria: staged rollout with scans and outreach disabled by default, bounded cloud API usage, and verified ownership grounding.

## Frontend Completed

- Backstage frontend plugin with:

  - Plugin ID: `scaffolder-ai-shadow-detective`
  - Standalone route: `/scaffolder-ai-shadow-detective`
  - Legacy plugin entry point
  - New frontend-system `/alpha` entry point
  - `ApiBlueprint` and `PageBlueprint`

- Typed authenticated AI Core SSE client:

  - Starts scans via `agents/scaffolder-ai-shadow-detective/runs`
  - Replays saved scans through `?run=<runId>`
  - Uses configured `ai.endpointPath`, defaulting to `ai-core`

- Typed reducer/hook with malformed artifact protection.

- Report-only scan page:

  - Run scan action
  - Live step progress
  - Report replay
  - Orphan resource inventory
  - Verified owner-tag group evidence
  - Explicit unknown-owner presentation
  - Human-click claim links
  - First-class `no_orphans`, `report_only`, `truncated`, and `partial` report states
  - Report limitations and non-mutation posture

### Scope alignment

The current backend is report-only, so the frontend deliberately does __not__ expose controls for:

- Scheduled scans
- Pagination/cursor continuation
- Dedupe suppression
- Approval/rejection
- Outreach messaging
- Cloud or catalog mutation

The README and report panel explicitly explain these constraints.

### Registration updated

- `/home/kevin/Repos/backstage/ai-crew-suite/tsconfig.json`
- `/home/kevin/Repos/backstage/ai-crew-suite/.eslintrc.cjs`
- `/home/kevin/Repos/backstage/ai-crew-suite/packages/app/package.json`
- `/home/kevin/Repos/backstage/ai-crew-suite/packages/app/src/App.tsx`
- `/home/kevin/Repos/backstage/ai-crew-suite/packages/app/src/App.test.tsx`
- `/home/kevin/Repos/backstage/ai-crew-suite/yarn.lock`

### Tests added

- Reducer test for valid and malformed `shadow-resource-report` artifacts.

- Report panel test covering:

  - verified `group:default/team-checkout` ownership evidence
  - unknown ownership
  - claim links
  - report-only outreach limitation

- App feature registration test passed.

## Backend Completed

### Shared prerequisite fixed

The plan's blocking cloud-tool contract mismatch was resolved in:

`/home/kevin/Repos/backstage/ai-crew-suite/plugins/backend/plugin-ai-core-backend-module-cloud-providers/src/registerTools.ts`

Cloud tools now register as real AI Core `ToolDefinition`s:

- `cloud.account.lookup`
- `cloud.resource.lookup`
- `cloud.resource.dependencies`

Each is:

- Read-only (`effect: 'read'`)
- Addressable by agent tool allow-lists
- Invokable through the AI Core runtime via `invoke(...)`

Updated cloud module tests now verify the typed IDs, read-only effects, and invocation behavior.

### Shadow Detective backend delivered

- Agent: `scaffolder-ai-shadow-detective`
- Workflow: `shadow-reconciliation`
- Artifact: `shadow-resource-report`
- Manual read-only runs via `cloud.resource.lookup`

Implemented deterministic flow:

1. Invokes normalized cloud inventory.
2. Loads catalog `Resource` bindings using the configured infrastructure annotation.
3. Filters exact catalog-bound resources from inventory.
4. Retains genuine orphans.
5. Resolves owner-tag evidence only when the owner maps to an existing catalog `Group`.
6. Retains unknown ownership explicitly when no verified group exists.
7. Generates an encoded, pre-populated human-click Scaffolder claim URL for each orphan.
8. Emits a replayable report artifact.

### Scenario coverage

Added a workflow test covering the plan's core case:

- Registered resource `db-registered-01` is filtered out via exact catalog binding.

- Shadow resource `db-shadow-99` remains in the report.

- Its `owner: team-checkout` tag resolves to:

  - `group:default/team-checkout`
  - high confidence

- No live cloud account, LLM, or message transport is required.

### Registration updated

- `/home/kevin/Repos/backstage/ai-crew-suite/tsconfig.json`
- `/home/kevin/Repos/backstage/ai-crew-suite/.eslintrc.cjs`
- `/home/kevin/Repos/backstage/ai-crew-suite/packages/backend/package.json`
- `/home/kevin/Repos/backstage/ai-crew-suite/packages/backend/src/index.ts`
- `/home/kevin/Repos/backstage/ai-crew-suite/app-config.yaml`
- `/home/kevin/Repos/backstage/ai-crew-suite/yarn.lock`

### Explicitly deferred

The implementation does not claim later plan milestones:

- Scheduled scans
- Pagination/cursors or resumable scans
- Dedupe ledger
- Creator-email, billing-code, or VCS ownership inference
- Approval checkpoint/resume
- Outreach messaging
- Any cloud/catalog mutation
- Frontend implementation

These limitations are emitted in the report artifact and documented in the package README.

## Definition of Done

- Normalized `cloud.*` `ToolDefinition`s land in `plugin-ai-core-backend-module-cloud-providers` and resolve through the AI Core runtime; this plugin's package, agent, runner (`run` + `resume`), triggers, config schema, and allow-list are registered (root + backend/app wiring included) with a barrel `index.ts` in every directory.
- Runs execute through the real AI Core controller/runtime with persisted replayable events, per-page cursor checkpoints, and `shadow-resource-report` / `shadow-outreach-record` artifacts.
- Registered-vs-orphan partitioning is a deterministic catalog-annotation set test; ownership hypotheses are evidence-ranked, resolve to real catalog entities, and degrade to `unknown` rather than guessing.
- The claim URL is deterministically constructed from an allow-listed template ref and opens a pre-populated Scaffolder form; the agent never triggers the task and never mutates cloud or catalog.
- An interrupted scan resumes at reconciliation without repeating inventory; consecutive scans provably suppress duplicate outreach while keeping suppressed resources visible in the report.
- No message is sent without a persisted approval; the ledger is written only on successful send, so rejected or failed outreach resurfaces on the next scan.
- Frontend renders the shadow inventory, ownership evidence, claim links, and outreach approval over live SSE and replay via `ApiBlueprint`/`PageBlueprint`; Playwright verifies scan, approve, reject, and suppression paths on fixtures.
- No output surface (SSE, artifacts, logs, audit, tests, chat messages) contains secret-bearing tags, uncited ownership claims, fabricated teams, or deletion recommendations presented as fact.
