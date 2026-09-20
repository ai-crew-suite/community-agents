---
layout: default
title: Catalog AI Insights
parent: Catalog
plugin_name: plugin-ai-agent-backend-catalog-ai-insights
subcategory: Knowledge
---

# Catalog AI Insights

{: .no_toc }

<span class="label label-blue">{{ page.subcategory }}</span>

---

## Summary

The Catalog AI Insights plugin answers contextual operational questions about any Software Catalog entity using a deterministic intent router, a RAG-backed context gatherer, and a citation-constrained LLM synthesis step. An operator or developer asks a natural-language question about a service — "Who is on call?", "Where are the dashboard links?", "Why did the last deployment fail?", or any free-form operational query — and the backend orchestrates a read-only tool pipeline that gathers on-call shifts, recent incidents, observability links, Kubernetes workload state, deployment timelines, recent pull requests, and knowledge-base chunks into a normalized, redacted context bundle. The model then authors a cited answer from that bundle alone.

Unlike plugins where the model drives decision-making, the insights agent treats the model as a **narrative synthesizer**: intent classification, tool selection, context normalization, and citation validation are all deterministic pure functions. If the model fails to produce valid output, the system falls back to a deterministic answer built directly from the gathered context — the user always receives a useful response.

## Key Features

- **Deterministic intent routing** via keyword/pattern matching — the model never chooses which tools to call; four intent classes (`ownership-oncall`, `observability-links`, `deployment-health`, `general-context`) each drive a fixed, per-intent tool plan
- **Entity-scoped RAG retrieval** through `knowledge.retrieve` with `entityFilter` scoped to the target catalog entity, capped by `maxRetrievalChunks`
- **Session memory** for conversational follow-up — the `sessionId` returned with each `done` event chains successive questions into a single session context
- **Context redaction** that strips bearer tokens, credential key=value pairs, AWS key IDs, and PEM private keys from every context item before it enters the model prompt or any artifact
- **Automatic fallback** when the model produces invalid JSON, uncited claims, or fails entirely — each context item becomes its own cited answer block, and the report is marked `partial`
- **Nightly scan dispatching** that lists catalog components annotated with `backstage.io/kubernetes-id`, plans a bounded set of deployment-health probes, and dispatches each as a fully persisted, replayable AI Core run
- **Entity-page insights card** with canned one-click questions and a free-form ask dialog, plus a standalone deep-linkable page at `/catalog-ai-insights`

## Architecture

The plugin follows the standard two-package Backstage agent layout:

- **Backend module** (`@ai-crew-suite/plugin-agent-catalog-insights-backend`, `role: backend-plugin-module`, `pluginId: ai-core`) — registers the `CatalogInsightsGraph` workflow runner (ID `catalog-insights`), the `catalog-ai-insights` agent definition with a read-only tool allow-list of 11 tools, manual and scheduler triggers, and an optional nightly scan task
- **Frontend plugin** (`@ai-crew-suite/plugin-agent-catalog-insights`, `role: frontend-plugin`, `pluginId: catalog-ai-insights`) — provides an entity page card (`EntityInsightsCard` / `EntityContextInsightsCard`), a standalone page at `/catalog-ai-insights`, a typed SSE API client, a live run progress view, and cited-answer/context panels

The graph runs through seven deterministic nodes: `request.validate → intent.classify → entity.resolve → context.gather → context.normalize → insight.synthesize → insight.finalize`. The artifact kind is `catalog-insight-report`. The agent's memory mode is `session`, enabling conversational follow-up across multiple questions about the same entity.

---

## Getting Started & Prerequisites

### Backstage Version

- Requires a Backstage backend running the `ai-core` plugin and its extension-point system (`agentExtensionPoint`, `triggerExtensionPoint`, `workflowRunnerExtensionPoint` from `@ai-crew-suite/plugin-kernel-node`)
- Requires the catalog backend plugin for entity resolution (`@backstage/catalog-client`)

### Agentic Requirements

All agentic dependencies are delivered through existing shared modules. The Catalog AI Insights plugin introduces **no new infrastructure**:

| Capability | Module | State |
|---|---|---|
| LLM routing & model registry | `plugin-ai-core-backend-module-llm-openai` or `llm-openrouter` | Required; `ai.agents.catalogAiInsights.model` references a registered model ID |
| RAG / knowledge retrieval | `plugin-ai-core-backend-module-retrieval-augmenter` + pgvector/qdrant storage | Required for entity-scoped documentation context; tool calls simply return empty when unavailable, never failing a run |
| Incident on-call | `plugin-ai-core-backend-module-incident-management` — `incident.oncall.get` / `incident.incident.list` | Optional; missing driver records a `partial` limitation |
| Observability | `plugin-ai-core-backend-module-observability` — `observability.dashboard.list` / `observability.logs.search` | Optional; missing driver records a `partial` limitation |
| Kubernetes | `plugin-ai-core-backend-module-kubernetes` — workload resolve/snapshot/timeline/events | Optional; requires `backstage.io/kubernetes-id` catalog annotation; missing driver records a `partial` limitation |
| VCS | `plugin-ai-core-backend-module-vcs` — `vcs.pull_request.list` | Optional; requires source repository annotation; missing repo annotation records a limitation |
| Runtime store | `plugin-ai-core-backend-module-runtime-store` | Required for run/artifact persistence |

---

## Installation & Setup

### Backend Setup

#### 1. Add the backend module dependency

In `packages/backend/package.json`:

```json
"dependencies": {
  "@ai-crew-suite/plugin-agent-catalog-insights-backend": "workspace:^"
}
```

#### 2. Wire the module into the backend

In `packages/backend/src/index.ts`, add alongside other `@ai-crew-suite` module loads:

```ts
import { catalogAiInsightsModule } from '@ai-crew-suite/plugin-agent-catalog-insights-backend';

// Inside your backend builder:
backend.add(catalogAiInsightsModule);
```

#### 3. Configure `app-config.yaml`

The module **throws at boot** if `ai.agents.catalogAiInsights.model` is missing. Add at minimum:

```yaml
ai:
  agents:
    catalogAiInsights:
      model: catalog-ai-insights
```

See [Configuration Reference](#configuration-reference) for the full schema and all defaults.

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
  "@ai-crew-suite/plugin-agent-catalog-insights": "workspace:^"
}
```

#### 2. Mount the page and entity card

In `packages/app/src/App.tsx`, import the alpha entry point:

```ts
import catalogAiInsightsExtensions from '@ai-crew-suite/plugin-agent-catalog-insights/alpha';

const app = createApp({
  features: [
    // ... existing features ...
    catalogAiInsightsExtensions,
  ],
});
```

This installs both the standalone page at `/catalog-ai-insights` and the `ai-insights` entity card on every catalog entity page.

#### 3. Extend App test expectations

In `packages/app/src/App.test.tsx`, add the catalog AI insights plugin ID (`catalog-ai-insights`) to the expected plugin list.

---

## Configuration Reference

### Full `app-config.yaml` Schema

All properties except `model` are optional and fall back to documented defaults:

```yaml
ai:
  agents:
    catalogAiInsights:
      # Required: installation-registered model ID for insight synthesis
      model: catalog-ai-insights

      # --- optional, with defaults ---

      maxContextItems: 24          # Max context items retained in the report bundle
      maxRetrievalChunks: 6        # Max knowledge-retrieval chunks attached per run
      maxLogResults: 5             # Max log-search results retained for observability answers
      maxToolInvocations: 10       # Hard cap on tool invocations per insight run
      lookbackMinutes: 1440        # Minutes of context gathered for deployment-health (24h)

      # Nightly scan settings (disabled by default — opt-in)
      scan:
        enabled: false             # Kill switch — scans must be explicitly enabled
        cron: '0 3 * * *'          # Default: daily at 03:00 UTC
        maxScanEntities: 25        # Maximum entities scanned per run
```

### RBAC & Permissions

The insights agent uses the shared AI Core RBAC model:

- **Question trigger** — any Backstage user with access to the `catalog-ai-insights` plugin can submit a question via `POST agents/catalog-ai-insights/runs`
- **Catalog entity access** — the module resolves the target entity through the catalog backend using a plugin-to-plugin auth token; if the entity does not exist or is not visible to the backend service identity, the run terminates at `entity.resolve`
- **Nightly scan dispatch** — the scheduler service principal holds plugin-to-plugin auth tokens via `auth.getPluginRequestToken` targeting `ai-core`; scans only dispatch runs, they never invoke the graph in-process
- **No per-intent RBAC** is defined yet; all four intent classes are available to any authenticated user

### Catalog Entity Annotations

Several intents depend on optional catalog annotations. Add these to your entity's `catalog-info.yaml` to enable full context gathering:

```yaml
metadata:
  annotations:
    # Enables on-call lookup via incident.oncall.get
    pagerduty.com/service-id: P123ABC

    # Enables Kubernetes workload resolution (deployment-health and nightly scan)
    backstage.io/kubernetes-id: payment-gateway

    # Enables source-code repository context (VCS pull request list)
    backstage.io/source-location: url:https://github.com/myorg/payment-gateway
```

Missing annotations are non-fatal: the run records a limitation describing which annotation was absent and proceeds with the context that could be gathered.

---

## Designing & Authoring Workflows (Agent Core)

### Workflow Schema

The insights agent is registered with the following definition:

```ts
// agent.ts
{
  id: 'catalog-ai-insights',
  modelRef: config.modelRef,           // e.g. 'catalog-ai-insights'
  workflowRef: 'catalog-insights',
  memory: 'session',                    // Enables conversational follow-up
  systemPrompt: CATALOG_AI_INSIGHTS_SYSTEM_PROMPT,
  toolIds: [                            // Read-only allow-list
    'knowledge.retrieve',
    'incident.oncall.get',
    'incident.incident.list',
    'observability.dashboard.list',
    'observability.logs.search',
    'kubernetes.workload.resolve',
    'kubernetes.workload.get_snapshot',
    'kubernetes.workload.get_timeline',
    'kubernetes.workload.list_events',
    'kubernetes.pod.get_snapshot',
    'vcs.pull_request.list',
  ],
  triggers: [
    { id: 'catalog-insights-question',    source: 'manual' },
    { id: 'catalog-insights-nightly-scan', source: 'scheduler' },
  ],
}
```

### Context Provisioning

A question is triggered by `POST agents/catalog-ai-insights/runs` with a `CatalogInsightRequest` body:

```ts
type CatalogInsightRequest = {
  version: 1;
  entityRef: string;        // e.g. 'component:default/payment-gateway'
  question: string;          // Natural-language, bounded to 2048 chars
  source: 'manual' | 'scheduler';
  sessionId?: string;        // Pass to continue a prior session
  intentHint?: InsightIntent; // Accepted only when classifier agrees or is unsure
};
```

At minimum, `entityRef` must be a valid catalog entity reference and `question` must be non-empty.

### Graph Nodes

The graph runs a seven-node pipeline. Nodes after `entity.resolve` are intent-sensitive — the tools invoked in `context.gather` depend on which intent was classified:

| Node | Source | Behaviour |
|---|---|---|
| **request.validate** | `request.ts` | Parses the JSON payload, validates `entityRef` against a catalog-ref regex, bounds `question` to 2048 characters, and validates `intentHint` against the known intent set |
| **intent.classify** | `intents.ts` | Runs pure keyword/pattern matching against the question text to select one of 4 intents. Accepts a caller-supplied `intentHint` only when it matches the classifier's decision or when the classifier would select `general-context` |
| **entity.resolve** | `CatalogContextResolver` | Resolves the entity reference through the catalog backend using a plugin-to-plugin auth token. Returns a catalog entity summary with type, name, labels, annotations, and relations. Failures terminate the run |
| **context.gather** | `gather.ts` | Invokes the intent-specific tool plan (see table below), building raw context items from each tool's output. Catalog entity summary and entity-scoped RAG retrieval are always appended |
| **context.normalize** | `context.ts` | Redacts sensitive text, deduplicates by source-scoped ID (first occurrence wins), sorts by `observedAt` timestamp (undated items last), caps to `maxContextItems`, and assigns stable `ctx-N` citation IDs |
| **insight.synthesize** | `insight.ts` | Builds a prompt from the system template + entity summary + normalized context bundle, invokes the model, extracts JSON from the response (tolerates fenced code blocks), validates every answer block and link against the citation ID set, and falls back to a deterministic answer if the model output fails validation |
| **insight.finalize** | `insight.ts` | Assembles the final `CatalogInsightReport` artifact with status (`answered`, `partial`, or `insufficient_context`), cited answer blocks, deep links, limitations, and the retained context bundle |

#### Per-Intent Tool Plans

| Intent | Tools invoked | Annotation required |
|---|---|---|
| **ownership-oncall** | `incident.oncall.get`, `incident.incident.list` | PagerDuty service ID annotation |
| **observability-links** | `observability.dashboard.list`, `observability.logs.search` | None (optional — degrades to `partial` if no driver) |
| **deployment-health** | `kubernetes.workload.resolve`, `.get_snapshot`, `.list_events`, `.get_timeline`, `vcs.pull_request.list` | `backstage.io/kubernetes-id` annotation |
| **general-context** | None (catalog entity summary + RAG retrieval only) | None |

Every intent always appends the catalog entity summary from `entity.resolve` and entity-scoped RAG chunks from `knowledge.retrieve`, regardless of the tool plan.

### Deterministic Intent Routing

The intent classifier (`intents.ts`) is a pure keyword/pattern router. The model is never consulted for tool selection. The classifier uses the following decision tree:

1. **`ownership-oncall`**: Matches `on-call`, `oncall`, `who owns`, `owner`, `ownership`, `maintainer`, `contact`, `responsible`, `paged`, `escalat`
2. **`observability-links`**: Matches `log`, `logs`, `logging`, `dashboard`, `dashboards`, `metrics`, `grafana`, `datadog`, `monitor`, `observab`, `trace`, `traces`, `where.*see`, `where.*find`
3. **`deployment-health`**: Matches `deploy`, `deployment`, `deployed`, `release`, `rollout`, `fail`, `failed`, `failure`, `failing`, `crash`, `crashloop`, `oom`, `restart`, `unhealthy`, `down`, `last deploy`, `last release`, `last failure`
4. **`general-context`**: Fallback for any question that does not match the patterns above

A caller-supplied `intentHint` is accepted only when (a) it matches the classifier's own decision, or (b) the classifier would select `general-context` — in which case the hint allows the caller to specify a better-targeted tool plan. A hint that contradicts a specific classifier match (e.g., asking about on-call with an `observability-links` hint) is silently ignored.

### Citation Enforcement

The model output is parsed and validated before it becomes part of the report:

1. **JSON extraction** — tolerates fenced code blocks (` ```json ... ``` `) and surrounding prose; extracts only the outermost JSON object
2. **Citation validation** — every `answer` block must cite at least one retained `ctx-N` ID; uncited blocks are dropped
3. **Link validation** — every `link` must reference an existing context ID in its `citation` field; uncited links are dropped
4. **Fallback** — if no valid answer blocks survive after validation, or if the model fails entirely, each context item becomes its own cited answer block via `buildDeterministicAnswer()`, and the report status is set to `partial`

### Prompts & Tools Management

The system prompt for the model enforces an evidence-cited posture:

```
Answer operational questions about catalog entities using only the supplied context
bundle. Cite context IDs for every claim, say "not available in this installation"
when a source is absent, and never fabricate links, names, or deployment states.
```

The full prompt sent to the model is built by `buildInsightPrompt()` and includes:
- The agent's system prompt
- The user's original question
- The catalog entity's type, name, labels, and annotations
- The complete normalized context bundle with `ctx-N` IDs
- Schema instructions requiring JSON output with `answer`, `links`, and `limitations` fields

#### Sensitive Text Redaction

All context item summaries and model output pass through `redactSensitiveText()` before entering the model prompt or appearing in any artifact, SSE event, log, or test snapshot. The redaction engine strips:
- Bearer tokens
- `password|secret|token|api_key|access_key|authorization|credential=...` patterns
- AWS access key IDs (`AKIA`/`ASIA` prefixes)
- PEM private key blocks

---

## User Guide & Interface Walkthrough

### Dashboard Overview

The insights frontend surfaces two entry points:

1. **Entity insights card** — mounted as an `InfoCard` on every catalog entity page via the `EntityCardBlueprint` (`ai-insights` card). Shows three canned one-click questions, a free-form "Ask a question" button, live run progress, and the cited answer/context panels.
2. **Standalone page** at `/catalog-ai-insights` — provides the same capabilities with an explicit entity-ref text field and query-parameter prefill (`?entityRef=component:default/my-service`).

Both surfaces deep-link to current runs via `?run=<id>` and persist the run ID into the URL as the first event arrives.

### Canned Questions

The entity card offers three one-click questions, each pre-bound to a deterministic intent:

| Button | Question sent | Intent |
|---|---|---|
| Who is on call? | `Who is on call for this service?` | `ownership-oncall` |
| Where are the logs? | `Where can I find logs and dashboards for this service?` | `observability-links` |
| Why did the last deployment fail? | `Why did the last deployment fail?` | `deployment-health` |

### Human-in-the-Loop Actions

#### Asking a question

1. Navigate to a catalog entity page — the "AI insights" card appears automatically
2. Click one of the three canned question buttons, or click **Ask a question** for a free-form dialog
3. In the free-form dialog, type any operational question and optionally select an intent hint from the dropdown
4. The card streams live SSE events: graph nodes enter/exit, per-intent tool calls complete, and the cited answer and context panels render as soon as the `catalog-insight-report` artifact arrives

#### Reading a cited answer

The `AnswerPanel` renders each answer block with its inline `ctx-N` citation badges. Each badge is clickable and scrolls the `ContextPanel` to the matching context item. Links surfaced from the context bundle (dashboards, PRs, entity pages) are rendered as clickable deep links.

#### Reviewing the context bundle

The `ContextPanel` renders every retained context item grouped by source (catalog, incident, observability, kubernetes, vcs, knowledge). Each item shows its source, kind, timestamp, summary, and any stable reference URL.

#### Following up with a session

After a run completes, the `sessionId` is preserved. Subsequent questions about the same entity automatically include the session ID, allowing the model to reference earlier answers. The `InsightStatusBanner` indicates whether a follow-up is in progress.

#### Replaying a past run

Append `?run=<id>` to either the standalone page or the entity page URL. The run's persisted events replay in order, restoring the complete answer, context bundle, and limitations.

### Nightly Scan Automation

When `scan.enabled` is set to `true`, the backend registers a `coreServices.scheduler` task (`catalog-ai-insights-nightly-scan`) that:

1. Lists catalog components annotated with `backstage.io/kubernetes-id` via `CatalogEntityResolver.findByAnnotation()`, capped at `maxScanEntities`
2. Plans a bounded set of deployment-health probes using the pure `planScan()` planner
3. Dispatches one `POST agents/catalog-ai-insights/runs` per entity using plugin-to-plugin auth tokens — each dispatched run is fully persisted, replayable, and auditable
4. Records dispatch success/failure counts to the logger

Guardrails: per-scan entity cap, in-flight mutex that skips a new scan while the previous one is still dispatching, 10-minute task timeout, 1-minute initial delay.

---

## Troubleshooting & FAQs

### Turbo Workspace Resolution

**Symptom**: `yarn typecheck --force` fails with missing exports from `@ai-crew-suite/plugin-kernel-node`.

**Fix**: Ensure the dependency is listed in the backend module's `package.json` as `"workspace:*"` and that you've run `yarn install` after adding it.

**Symptom**: TypeScript errors on `CatalogEntityResolver` type.

**Fix**: This type is exported by `@ai-crew-suite/plugin-kernel-node`. Verify you're importing from the workspace-scoped package and not a transitive copy.

### Agent Execution Failures

**"Catalog AI insights requires ai.agents.catalogAiInsights configuration to be set" at boot**

The module fast-fails at backend startup. Add the minimal config:

```yaml
ai:
  agents:
    catalogAiInsights:
      model: catalog-ai-insights
```

**Run terminates with `insufficient_context` on every question**

No tools returned usable data. Check that:
- The entity reference resolves to an actual catalog entity (verify in the catalog UI)
- The backend service identity has permission to read the entity
- Required annotations are present for the intent (see the annotation table in Configuration Reference)
- The relevant driver modules (incident management, observability, kubernetes, VCS) are installed and configured
- The `knowledge.retrieve` tool is functional (requires the retrieval-augmenter module and a vector database)

**Answer says "not available in this installation" for a source that should work**

A driver returned no results or was not installed. The report's `limitations` array lists exactly which sources were unavailable and why. Check that:
- The incident management module is installed for on-call/incident context
- The observability module is installed for dashboard and log links
- The Kubernetes module is installed and the entity has `backstage.io/kubernetes-id`
- The VCS module is installed and the entity has `backstage.io/source-location`

**The model produces uncited answers or invalid output**

This is a handled failure mode — not a bug. The graph detects missing citations, drops uncited claims, and falls back to a deterministic answer built directly from context items. The user still receives a useful response, and the report status switches to `partial` with a limitation explaining the fallback. If this happens repeatedly, the model may be struggling with the JSON output schema; consider switching to a more capable model via `ai.agents.catalogAiInsights.model`.

**LLM rate limits or context window overruns**

- Reduce `maxContextItems` to present fewer context items to the model
- Reduce `maxRetrievalChunks` to limit knowledge-base context
- Reduce `maxToolInvocations` to cap the read-tool budget per question
- The system prompt is compact and context items are capped at 1024 characters each, bounding total prompt size

### Frontend Issues

**Entity cards show no AI insights card**

Ensure the alpha entry point is imported and included in the `createApp` features array (see Frontend Setup). The `EntityCardBlueprint` hooks into the catalog entity page automatically.

**"Ask a question" button does nothing**

Ensure `playwright/.auth/login.json` exists (created by the CI mock auth step or manually as `{}`). The API client requires Backstage identity credentials.

**Canned question buttons produce different answers than expected**

Each canned question carries a fixed `intentHint`. If the question text does not match the intent's keyword patterns, the classifier overrides the hint (unless the classifier selects `general-context`, in which case the hint prevails). To force a specific intent, use the free-form dialog and select the intent from the dropdown.

---

## Roadmap

### Slack Notification Dispatch

The implementation plan deferred `communication.message.post` (Slack dispatch of scan findings). When this tool lands in a future communication module:

- Nightly scan runs will optionally post a summary to a configured Slack channel for each entity with a degraded or unhealthy deployment state
- Dispatch will be gated behind an explicit `scan.notify.enabled` config flag and approval policy
- Notification content will be bounded, redacted, and never include raw logs, secrets, or model output

### Multi-Entity & Portfolio Questions

Currently restricted to one entity ref per run. Future work:

- Accept entity queries scoped to catalog kinds, labels, or annotation filters (e.g., "which services owned by team-payments had deployment failures this week?") rather than a single `entityRef`
- Produce a portfolio-level answer with per-entity cited context blocks, each scoped to its own gathered data

### Usage Dashboards & Model Evaluation

Post-stabilization observability and quality surface:

- Usage dashboards tracking question volume, intent distribution, answered/partial/insufficient-context ratios, scan dispatch throughput, and model latency/token cost
- An opt-in evaluation harness that compares model-authored answers against a curated set of questions with known-good catalog fixture data, measuring citation grounding and factual accuracy
- Token-usage and latency monitoring per question, surfaced through Backstage's built-in observability plugin

### Catalog Entity Search Integration

Allow the standalone page to accept a catalog entity name or search query (rather than requiring an explicit `entityRef`) and auto-resolve it through the catalog search API before submitting the question.

### Write-Capable Follow-Up Actions

Extending the insights agent beyond read-only Q&A:

- "Fix this" follow-ups that delegate to other agents (e.g., route a deployment-health question's findings to the scaffolder AI guardrail agent or the Kubernetes AI responder)
- "Notify the team" actions that post cited insight summaries to incident channels or project management tools
- These actions remain human-triggered and explicit, never autonomous
