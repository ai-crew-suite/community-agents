---
layout: default
title: Scaffolder AI Shadow Detective
parent: Scaffolder
plugin_name: plugin-ai-agent-backend-scaffolder-ai-shadow-detective
subcategory: Governance
---

# Scaffolder AI Shadow Detective

{: .no_toc }

<span class="label label-blue">{{ page.subcategory }}</span>

---

## Summary

The Scaffolder AI Shadow Detective audits **live cloud infrastructure** against the **Backstage Software Catalog**, surfacing orphaned or undocumented resources that lack a matching catalog `Resource` binding. It runs a read-only `shadow-reconciliation` workflow that inventories cloud resources through the normalized `cloud.resource.lookup` tool, loads the catalog's `Resource` annotations and `Group` entities, filters out everything already registered, and emits a replayable `shadow-resource-report` artifact listing every unbound asset with an ownership hypothesis and a pre-populated **Scaffolder claim URL**.

The pipeline is **entirely deterministic and read-only**: registered-vs-orphan partitioning, owner-tag resolution, and claim-URL construction are all pure functions. **No LLM is invoked** (the model reference is reserved for future outreach copy), the agent's only tool is the read-only `cloud.resource.lookup`, and the remediation path is a link a human clicks — the agent never mutates cloud infrastructure or writes to the catalog.

## Key Features

- **Exact catalog-binding filtering** — `reconcileAssets()` partitions inventory by exact resource-ID match against the configured infrastructure annotation on catalog `Resource` entities; a `catalogEntityRef` hint on a cloud asset is never trusted alone
- **Deterministic orphan partition** — every asset is either `registered` (its ID matches an annotated catalog `Resource`) or an `orphan` (unbound)
- **Catalog-resolved ownership only** — `inferOwnership()` resolves owner-tag values to a hypothesis only when the value maps to an existing catalog `Group`; otherwise the asset is reported with `confidence: 'unknown'` rather than a guessed owner
- **Human-click claim URLs** — `claimLink()` deterministically builds a pre-populated Scaffolder URL from an allow-listed template ref and encoded asset data; the agent never triggers the Scaffolder task
- **Four report statuses** — `report_only` (orphans found), `no_orphans` (clean), `truncated` (inventory capped at `maxResources`), and `partial` (cloud inventory unavailable)
- **Read-only, non-mutating posture** — the report and the UI both state this explicitly; the current milestone performs no scheduled scans, cursor resume, dedupe, approval gating, outreach, or any cloud/catalog write
- **Malformed-artifact protection** — the frontend reducer ignores unrelated or malformed `shadow-resource-report` artifacts

## Architecture

The plugin follows the standard two-package Backstage agent layout:

- **Backend module** (`@ai-crew-suite/plugin-agent-scaffolder-shadow-detective-backend`, `role: backend-plugin-module`, `pluginId: ai-core`) — registers the `ReconciliationGraph` workflow runner (ID `shadow-reconciliation`), the `scaffolder-ai-shadow-detective` agent with a single read-only tool (`cloud.resource.lookup`), and a manual trigger (`shadow-reconciliation-on-demand`)
- **Frontend plugin** (`@ai-crew-suite/plugin-agent-scaffolder-shadow-detective`, `role: frontend-plugin`, `pluginId: scaffolder-ai-shadow-detective`) — provides a standalone page at `/scaffolder-ai-shadow-detective` that starts scans, streams live SSE events, renders the orphan inventory and owner evidence, and replays saved runs via `?run=<id>`

The graph runs a three-node pipeline — `inventory` → `reconcile` → `infer` — and emits the `shadow-resource-report` artifact.

---

## Getting Started & Prerequisites

### Backstage Version

- Requires a Backstage backend running the `ai-core` plugin and its extension-point system (`agentExtensionPoint`, `triggerExtensionPoint`, `workflowRunnerExtensionPoint` from `@ai-crew-suite/plugin-kernel-node`)

### Agentic Requirements

| Capability | Module | State |
|---|---|---|
| LLM routing & model registry | `plugin-ai-core-backend-module-llm-openai` or `-llm-openrouter` | Required for agent registration; `ai.agents.shadowDetective.model` references a registered model ID (not currently invoked — reconciliation is deterministic) |
| Cloud inventory | `plugin-ai-core-backend-module-cloud-providers` (+ `-aws`/`-azure`/`-gcp` drivers) — `cloud.resource.lookup` | Required and normalized to a real read-only `ToolDefinition`; a missing driver produces a `partial` report |
| Catalog bindings | `@backstage/catalog-client` via `coreServices.discovery` | Required for registered-`Resource` and `Group` lookups |
| Runtime store | `plugin-ai-core-backend-module-runtime-store` | Required for run/artifact persistence and replay |
| Outreach (future) | `plugin-ai-core-backend-module-communication` — `communication.message.post` | Not active in v1; approval-gated outreach is deferred |
| Scheduler (future) | `coreServices.scheduler` | Not active in v1; scheduled scans are deferred |

---

## Installation & Setup

### Backend Setup

#### 1. Add the backend module dependency

In `packages/backend-modern/package.json`:

```json
"dependencies": {
  "@ai-crew-suite/plugin-agent-scaffolder-shadow-detective-backend": "workspace:^"
}
```

#### 2. Wire the module into the backend

In `packages/backend-modern/src/index.ts` (the legacy `packages/backend-legacy` registers identically):

```ts
backend.add(
  loadBackendFeature(
    import('@ai-crew-suite/plugin-agent-scaffolder-shadow-detective-backend'),
  ),
);
```

#### 3. Configure `app-config.yaml`

The module **throws at boot** if `ai.agents.shadowDetective` is missing, and validates that `catalog.annotation` is set and `claim.templateRef` starts with `template:`:

```yaml
ai:
  agents:
    shadowDetective:
      model: shadow-detective
      catalog:
        annotation: example.com/resource-id
      claim:
        templateRef: template:default/register-existing-resource
```

See [Configuration Reference](#configuration-reference) for the full schema.

#### 4. Refresh Yarn PnP

```bash
yarn install
yarn typecheck --force
yarn lint --force
```

### Frontend Setup

#### 1. Add the frontend plugin dependency

In `packages/app/package.json`:

```json
"dependencies": {
  "@ai-crew-suite/plugin-agent-scaffolder-shadow-detective": "workspace:^"
}
```

#### 2. Mount the page

In `packages/app/src/App.tsx`:

```ts
import shadowDetectivePlugin from '@ai-crew-suite/plugin-agent-scaffolder-shadow-detective/alpha';

const app = createApp({
  features: [
    // ... existing features ...
    shadowDetectivePlugin,
  ],
});
```

The page is available at `/scaffolder-ai-shadow-detective`.

#### 3. Extend App test expectations

In `packages/app/src/App.test.tsx`, add `scaffolder-ai-shadow-detective` to the expected plugin list (and mock the `/alpha` import).

---

## Configuration Reference

### Full `app-config.yaml` Schema

```yaml
ai:
  agents:
    shadowDetective:
      # Required
      model: shadow-detective                       # installation-registered model ID (reserved)

      # Required
      catalog:
        annotation: example.com/resource-id         # catalog Resource annotation holding the cloud ID

      # Required — must start with 'template:'
      claim:
        templateRef: template:default/register-existing-resource
        baseUrl: http://localhost:3000              # optional, default http://localhost:3000

      # optional, with defaults
      maxResources: 100                             # cap on resources scanned per run
      ownership:
        ownerTagKeys: [owner, team]                 # tag keys probed for ownership, in order
      scan:
        enabled: false                              # reserved for future scheduled scans (no scheduler deps)
```

All properties except `model`, `catalog.annotation`, and `claim.templateRef` are optional and fall back to documented defaults.

### RBAC & Permissions

The shadow detective uses the shared AI Core RBAC model:

- **Manual scan** — any Backstage user with access to the `scaffolder-ai-shadow-detective` plugin can start a scan via `POST agents/scaffolder-ai-shadow-detective/runs`
- **No scheduled scans** are registered yet (the module has no scheduler dependencies); the `scan.enabled` config key is accepted but ineffective in v1
- **No approval gate or outreach** exists in v1 — the workflow is report-only and never performs an action requiring approval

---

## Designing & Authoring Workflows (Agent Core)

### Workflow Schema

The agent is registered with the following definition (`agent.ts`):

```ts
{
  id: 'scaffolder-ai-shadow-detective',
  modelRef: config.modelRef,            // e.g. 'shadow-detective' (reserved)
  workflowRef: 'shadow-reconciliation',
  memory: 'none',                        // Each run is a fresh snapshot
  systemPrompt: SHADOW_DETECTIVE_SYSTEM_PROMPT,
  toolIds: ['cloud.resource.lookup'],    // read-only inventory
  triggers: [
    { id: 'shadow-reconciliation-on-demand', source: 'manual' },
  ],
}
```

### Context Provisioning

A scan is triggered by `POST agents/scaffolder-ai-shadow-detective/runs` with a versioned, manual request:

```ts
type ShadowScanRequest = {
  version: 1;
  source: 'manual';
  provider?: string;   // accepted; not used to scope the inventory call in v1
  service?: string;    // forwarded to cloud.resource.lookup as the service filter
};
```

`service` is forwarded directly to the `cloud.resource.lookup` tool. `provider` is currently only surfaced in the `partial` error report — the successful report derives its `providers` list from the resources actually returned.

### Graph Nodes

The graph runs a three-node pipeline in `ReconciliationGraph.ts`:

| Node | Source | Behaviour |
|---|---|---|
| **inventory** | `ReconciliationGraph.ts` | Invokes `cloud.resource.lookup` (read-only, 15s timeout, 1 invocation). On failure, emits a `partial` report and terminates |
| **reconcile** | `reconcile.ts` + `CatalogBindingIndex.ts` | Loads catalog `Resource` annotations and `Group` refs, maps inventory to `CloudAsset`s, partitions by exact ID match into `registered` and `orphans` |
| **infer** | `ownership.ts` + `claimLink.ts` | Resolves owner-tag evidence to a catalog `Group`, assigns `high` or `unknown` confidence, and builds the claim URL per orphan |

### The Reconciliation Engine

`reconcileAssets()` is a pure function:

```ts
const reconcileAssets = (assets, registeredIds) => ({
  registered: assets.filter(a => registeredIds.has(a.id)),
  orphans: assets.filter(a => !registeredIds.has(a.id)),
});
```

The `registeredIds` set is built by `CatalogBindingIndex.load()`, which queries the catalog for `kind: Resource` and `kind: Group` entities. A `Resource` is registered when its configured annotation value matches a cloud asset ID exactly; a `Group` contributes a `group:<namespace>/<name>` ref to the ownership resolution set.

### Ownership Inference

`inferOwnership()` probes the configured `ownerTagKeys` (plus the asset's `owner` field) and emits a hypothesis **only** when the resolved value maps to an existing catalog `Group`:

- A value already prefixed `group:` is used as-is; a bare value resolves to `group:default/<value>`
- No resolvable group → empty hypotheses → `confidence: 'unknown'` and a rationale that no evidence is available
- A resolvable group yields a single hypothesis with `basis: 'owner_tag'`, `score: 1`, and `evidence: ['tag-1']`

### Claim URL Construction

`claimLink()` builds the pre-populated Scaffolder deep link deterministically (no Scaffolder API call is needed — this is URL assembly, not execution):

```ts
// `${baseUrl}/create/templates/${encodeURIComponent(templateRef)}?formData=${encodeURIComponent(formData)}`
// formData = JSON.stringify({ resourceId, provider, resourceType })
```

The template ref is allow-listed by config and the model never supplies the URL, so users cannot be redirected to an arbitrary destination.

### The Shadow Resource Report

```ts
type ShadowResourceReport = {
  providers: string[];
  scanned: number;
  registered: number;
  orphans: ShadowResource[];          // each with fingerprint, hypotheses, confidence, claimUrl, rationale
  suppressedCount: number;            // always 0 in v1
  status: 'report_only' | 'no_orphans' | 'truncated' | 'partial';
  limitations: string[];
  evidence: { id, source, summary, reference? }[];
};
```

The `fingerprint` is `${provider}:${type}:${id}` (e.g. `aws:rds:db-shadow-99`). Every report carries a persistent limitation recording that cursor resumption, dedupe, scheduled scans, creator/billing ownership inference, and approval-gated outreach are not active in this report-only milestone; a `truncated` report adds the cap note.

### Prompts & Tools Management

The system prompt is registered but **not currently invoked**:

```
Report only supplied cloud, catalog, and tag evidence. Never invent an owner, claim URL, resource, catalog binding, or deletion recommendation.
```

The single allow-listed tool is `cloud.resource.lookup` (`effect: 'read'`). The `modelRef` and `systemPrompt` are reserved for future rationale and outreach composition.

---

## User Guide & Interface Walkthrough

### Dashboard Overview

The frontend lives at `/scaffolder-ai-shadow-detective` and provides a single page with:

1. **Run scan** button — starts a report-only scan (currently with no provider/service filters)
2. **Scan progress** — streams the live step nodes (`inventory`, `reconcile`, `infer`) as they enter and exit
3. **Shadow resource report** — renders the report status, scanned/registered/orphan counts, and one card per orphan
4. **Replay** — saved runs are deep-linked via `?run=<id>` and replayed from persisted events

### Human-in-the-Loop Actions

#### Running a scan

1. Navigate to `/scaffolder-ai-shadow-detective`
2. Click **Run scan**
3. Watch the step progress and report stream over SSE

#### Reading the report

Each orphan card shows:

- **Resource** — the asset ID, provider, and type, with a `high` or `unknown` confidence chip
- **Owner** — the resolved `groupRef` with `basis: owner_tag` and evidence, or "unknown — no catalog-resolved evidence"
- **Claim this resource** — an external link to the pre-populated Scaffolder template
- **Rationale** — the deterministic explanation for the confidence

The report footer lists limitations and the non-mutation posture ("This report does not send outreach or mutate cloud or catalog resources.").

---

## Troubleshooting & FAQs

### Turbo Workspace Resolution

**Symptom**: `yarn typecheck --force` fails with missing exports from `@ai-crew-suite/plugin-kernel-node`.

**Fix**: Ensure the dependency is listed in the backend module's `package.json` as `"workspace:*"` and that you've run `yarn install` after adding it.

### Agent Execution Failures

**"Shadow detective requires ai.agents.shadowDetective configuration" at boot**

The module fast-fails at backend startup. Add the minimal config with `model`, `catalog.annotation`, and `claim.templateRef` set.

**"Shadow detective requires catalog.annotation and claim.templateRef" at boot**

`catalog.annotation` must be non-empty and `claim.templateRef` must start with `template:`. Correct both and restart.

**Every run shows `status: partial`**

The `cloud.resource.lookup` tool failed (no cloud provider driver configured, or the provider API is unreachable). The report records the error in its `limitations` list.

**The report shows `no_orphans`**

No unbound resources were found — every inventoried asset ID matched a catalog `Resource` annotation. This is a clean result, not an error.

**An orphan shows `confidence: unknown`**

The owner tag did not resolve to an existing catalog `Group`. Ensure the tag value matches a catalog group name (or use `group:namespace/name`), and that the group exists in the catalog.

**The report shows `truncated`**

Inventory exceeded `maxResources`; the report is capped and records the limitation. Raise `maxResources` (or wait for cursor-resumable scans on the roadmap) to see the full inventory.

### Frontend Issues

**The page loads but "Run scan" does nothing**

Ensure Backstage identity credentials are available — the API client attaches a Bearer token to the SSE request.

**The report panel shows `no_orphans` but I expected orphans**

Check the `catalog.annotation` value in `app-config.yaml` — an orphan is only an orphan relative to the exact annotation values on catalog `Resource` entities.

---

## Roadmap

The following features are planned but were **explicitly out of scope** for the report-only v1 milestone.

### Scheduled Scans

The `scan.enabled` config key (default `false`) is accepted but no scheduler is registered. When `coreServices.scheduler` is wired in, the agent will run a periodic, opt-in, globally-mutexed fleet reconciliation.

### Cursor-Resumable Long Scans

The current graph invokes `cloud.resource.lookup` once and caps results at `maxResources`. Per-page cursor checkpoints, resume-at-reconcile, and truncation-as-throttling are planned so interrupted scans continue without re-listing.

### Dedupe Ledger

A persistent fingerprint-keyed ledger is planned to suppress repeat outreach while keeping suppressed resources visible in the report.

### Richer Ownership Inference

`inferOwnership()` currently resolves owner-tag evidence only. Creator-email (via catalog `User` → `memberOf` → `Group`), billing-code, and VCS creation-history evidence are planned to produce evidence-ranked hypotheses with an explicit `unknown` fallback.

### Approval-Gated Outreach

Messaging via `communication.message.post` (with `communication.channel.lookup` channel resolution) is planned, gated behind a persisted approval checkpoint with audit logging, `resume('approved'/'rejected')`, and no-double-post idempotency.

### Never in Scope

The following are architectural guardrails, not roadmap items:

- **No cloud mutation** — stop/delete/tag/resize is never an agent action; remediation is always a human-clicked Scaffolder link
- **No catalog writes** — the agent never registers resources itself; the claim URL is the registration path
