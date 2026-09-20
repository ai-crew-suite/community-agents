---
layout: default
title: On-Call Handover Assistant
parent: Incident Response
plugin_name: plugin-ai-agent-backend-oncall-ai-handover-assistant
subcategory: Operations
---

# On-Call Handover Assistant

{: .no_toc }

<span class="label label-blue">{{ page.subcategory }}</span>

---

## Summary

The On-Call Handover Assistant automates shift handover briefings by **aggregating operational signals across a trailing time window** and compiling a deterministic, cited brief for the incoming on-call engineer. It collects alert history, active incidents, Kubernetes deployment events, merged pull requests, and open high-priority tickets in parallel, clusters repeated incident patterns by service and title, optionally enriches clusters with runbook documentation, and produces a structured `HandoverBrief` artifact with ranked highlights, active incident clusters, open tickets, notable changes, and recommended watch items.

The entire process is **deterministic and model-free**: the graph collects data, clusters signals by service/title similarity, and assembles the brief from the clustered and filtered signal data. No LLM is invoked — the LLM model reference in the agent configuration exists for future AI-powered summarization but is not consulted by the current graph. Every claim in the brief is backed by a stable `sig-N` citation referencing the collected signal.

## Key Features

- **Parallel multi-source signal collection** — five data sources (alert history, incident list, K8s deployment timeline, merged PRs, high-priority tickets) collected simultaneously with a configurable per-source cap
- **Deterministic incident clustering** — repeated incidents grouped by service/title with per-cluster status, first/last-seen timestamps, and correlated non-incident signals by service
- **Optional runbook enrichment** — top clusters (up to `maxEnrichedClusters`, default 5) enriched with entity-scoped RAG context from `knowledge.retrieve`
- **Shift-boundary scheduling** — configurable per-shift cron schedules (`{cron, team}`) dispatch briefs at team-specific shift change times
- **Three brief statuses** — `compiled` (no limitations), `partial` (some collectors limited or degraded), `no_activity` (zero signals in the window)
- **Replayable deep links** — every run is persisted and replayable via `?run=<id>`, including scheduled briefs

## Architecture

The plugin follows the standard two-package Backstage agent layout:

- **Backend module** (`@ai-crew-suite/plugin-agent-oncall-handover-backend`, `role: backend-plugin-module`, `pluginId: ai-core`) — registers the `HandoverGraph` workflow runner (ID `oncall-handover`), the `oncall-handover-assistant` agent definition with a read-only allow-list of 11 tools, manual and scheduler triggers, and optional shift-boundary scheduling
- **Frontend plugin** (`@ai-crew-suite/plugin-agent-oncall-handover`, `role: frontend-plugin`, `pluginId: oncall-handover-assistant`) — provides a standalone page at `/oncall-handover-assistant` with a compile dialog, live SSE run view, clustered-incident/deployment/ticket panels, status banner, and deep-linked replay

The graph runs six deterministic nodes: `window.resolve → collect.parallel → cluster.analyze → context.enrich → brief.summarize → brief.finalize`. The artifact kind is `oncall-handover-brief`. The agent has `memory: 'none'` — each run is a fresh window with no conversational continuity.

---

## Getting Started & Prerequisites

### Backstage Version

- Requires a Backstage backend running the `ai-core` plugin and its extension-point system (`agentExtensionPoint`, `triggerExtensionPoint`, `workflowRunnerExtensionPoint` from `@ai-crew-suite/plugin-kernel-node`)

### Agentic Requirements

| Capability | Module | State |
|---|---|---|
| LLM routing & model registry | `plugin-ai-core-backend-module-llm-openai` or `llm-openrouter` | Required; `ai.agents.oncallHandover.model` references a registered model ID (not currently invoked — reserved for future AI summarization) |
| Incident management | `plugin-ai-core-backend-module-incident-management` — `incident.alert.history`, `incident.incident.list` | Required for alert and incident collection; missing driver degrades to an empty source in the brief with a limitation |
| Kubernetes | `plugin-ai-core-backend-module-kubernetes` — `kubernetes.workload.get_timeline` | Optional; missing driver degrades with a limitation |
| VCS | `plugin-ai-core-backend-module-vcs` — `vcs.pull_request.list` | Optional; missing driver degrades with a limitation |
| Project management | `plugin-ai-core-backend-module-project-management` — `project.ticket.search` | Optional; missing driver degrades with a limitation |
| RAG / knowledge retrieval | `plugin-ai-core-backend-module-retrieval-augmenter` + pgvector/qdrant storage | Optional; enriches top incident clusters with runbook context; retrieval misses are non-fatal |
| Runtime store | `plugin-ai-core-backend-module-runtime-store` | Required for run/artifact persistence |

---

## Installation & Setup

### Backend Setup

#### 1. Add the backend module dependency

In `packages/backend/package.json`:

```json
"dependencies": {
  "@ai-crew-suite/plugin-agent-oncall-handover-backend": "workspace:^"
}
```

#### 2. Wire the module into the backend

In `packages/backend/src/index.ts`, add alongside other `@ai-crew-suite` module loads:

```ts
import { oncallHandoverModule } from '@ai-crew-suite/plugin-agent-oncall-handover-backend';

// Inside your backend builder:
backend.add(oncallHandoverModule);
```

#### 3. Configure `app-config.yaml`

The module **throws at boot** if `ai.agents.oncallHandover.model` is missing. Add at minimum:

```yaml
ai:
  agents:
    oncallHandover:
      model: oncall-handover
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
  "@ai-crew-suite/plugin-agent-oncall-handover": "workspace:^"
}
```

#### 2. Mount the page

In `packages/app/src/App.tsx`, import the alpha entry point:

```ts
import oncallHandoverExtensions from '@ai-crew-suite/plugin-agent-oncall-handover/alpha';

const app = createApp({
  features: [
    // ... existing features ...
    oncallHandoverExtensions,
  ],
});
```

The page is available at `/oncall-handover-assistant`.

#### 3. Extend App test expectations

In `packages/app/src/App.test.tsx`, add the handover plugin ID (`oncall-handover-assistant`) to the expected plugin list.

---

## Configuration Reference

### Full `app-config.yaml` Schema

All properties except `model` are optional and fall back to documented defaults:

```yaml
ai:
  agents:
    oncallHandover:
      # Required: installation-registered model ID (reserved for future AI summarization)
      model: oncall-handover

      # --- optional, with defaults ---

      windowHours: 12              # Default trailing analysis window in hours
      maxWindowHours: 48           # Hard clamp on any requested window
      maxSignalsPerSource: 100     # Per-source collection cap
      maxClusters: 25              # Max incident clusters retained
      maxEnrichedClusters: 5       # Top clusters enriched with runbook context
      maxToolInvocations: 16       # Hard cap on tool invocations per run

      # Shift-boundary scheduling (disabled by default — opt-in)
      schedule:
        enabled: false             # Kill switch
        shifts:                    # Array of per-team shift-change schedules
          - cron: '0 8 * * *'     # 08:00 UTC
            team: platform
          - cron: '0 16 * * *'    # 16:00 UTC
            team: platform
```

### RBAC & Permissions

The handover assistant uses the shared AI Core RBAC model:

- **On-demand brief** — any Backstage user with access to the `oncall-handover-assistant` plugin can compile a brief via `POST agents/oncall-handover-assistant/runs`
- **Shift scheduler dispatch** — the scheduler service principal holds plugin-to-plugin auth tokens via `auth.getPluginRequestToken`; scheduled dispatches are always for the configured team and carry no user identity
- **No per-team RBAC** is defined yet; the `team` field is advisory and does not enforce access control

### Request Validation

A valid `HandoverRequest` must include:
- `version: 1`
- At least one of `team` (string) or `entityRefs` (non-empty string array)
- Optional `endsAt` must be a valid ISO timestamp if provided
- Optional `windowHours` must be a positive number if provided and is clamped to `maxWindowHours`

---

## Designing & Authoring Workflows (Agent Core)

### Workflow Schema

The handover agent is registered with the following definition:

```ts
// agent.ts
{
  id: 'oncall-handover-assistant',
  modelRef: config.modelRef,           // e.g. 'oncall-handover' (reserved for future use)
  workflowRef: 'oncall-handover',
  memory: 'none',                       // Each run is a fresh window
  systemPrompt: ONCALL_HANDOVER_SYSTEM_PROMPT,
  toolIds: [
    'incident.alert.history',
    'incident.incident.list',
    'incident.incident.get',
    'incident.oncall.get',
    'kubernetes.workload.get_timeline',
    'kubernetes.workload.list_events',
    'kubernetes.workload.get_snapshot',
    'vcs.pull_request.list',
    'project.ticket.search',
    'project.ticket.get',
    'knowledge.retrieve',
  ],
  triggers: [
    { id: 'oncall-handover-on-demand',   source: 'manual' },
    { id: 'oncall-handover-shift-change', source: 'scheduler' },
  ],
}
```

### Context Provisioning

A brief is triggered by `POST agents/oncall-handover-assistant/runs` with a `HandoverRequest` body:

```ts
type HandoverRequest = {
  version: 1;
  source: 'manual' | 'scheduler';
  windowHours?: number;          // Overrides default 12; clamped to maxWindowHours
  endsAt?: string;               // ISO timestamp; default is now
  team?: string;                 // Scopes incident and ticket collection
  entityRefs?: string[];         // Scopes K8s and VCS collection
  incomingEngineer?: string;     // Displayed in the brief header
};
```

At minimum, one of `team` or `entityRefs` must be specified. The trailing window is computed from `endsAt - windowHours` to `endsAt`; when `endsAt` is omitted, the current time is used.

### Graph Nodes

The graph runs a six-node pipeline. The brief is assembled **entirely deterministically** — no LLM is consulted:

| Node | Source | Behaviour |
|---|---|---|
| **window.resolve** | `window.ts` + `request.ts` | Parses and validates the request payload, resolves the trailing window (clamped to `maxWindowHours`), records a limitation if the window was clamped |
| **collect.parallel** | `collectors.ts` | Fires 5 collectors simultaneously via `Promise.all`: `incident.alert.history`, `incident.incident.list`, `kubernetes.workload.get_timeline`, `vcs.pull_request.list`, `project.ticket.search`. Each is capped at `maxSignalsPerSource`. Every result is normalized into a `RawSignal` with unique `id`, `source`, `kind`, `summary`, `service`, `observedAt`, `status`, and `reference` |
| **cluster.analyze** | `clustering.ts` | Groups incident signals by `service|summary` key, counts occurrences, derives per-cluster status (`active` > `resolved` > `unknown`), correlates non-incident signals by matching service, sorts by count descending, and caps to `maxClusters` |
| **context.enrich** | `RunbookRetriever` | Retrieves entity-scoped RAG documentation for up to `maxEnrichedClusters` top clusters via `knowledge.retrieve`, appends retrieved chunks as `knowledge`-kind `RawSignal` entries |
| **brief.summarize** | `brief.ts` | Builds the `HandoverBrief` deterministically: status from signal count + limitations, highlights from active clusters, tickets from `ticket`-kind signals, notable changes from `deployment`/`pr`-kind signals, watch items from active cluster titles |
| **brief.finalize** | `HandoverArtifactWriter` | Emits the `oncall-handover-brief` artifact and the `done` event |

### Parallel Collector Targets

The five parallel collectors, their tool IDs, input scoping, and signal kinds:

| Tool | Source | Kind | Scoped by |
|---|---|---|---|
| `incident.alert.history` | `incident` | `alert` | `team`, time window |
| `incident.incident.list` | `incident` | `incident` | `team`, time window |
| `kubernetes.workload.get_timeline` | `kubernetes` | `deployment` | `entityRefs`, time window |
| `vcs.pull_request.list` | `vcs` | `pr` | `entityRefs`, time window, `merged: true` |
| `project.ticket.search` | `project` | `ticket` | `team`, `status: open`, `priority: high` |

### Deterministic Clustering

The `clusterSignals()` function in `clustering.ts`:

1. Filters signals to `source === 'incident'` only
2. Groups by `service|summary.toLowerCase()` key
3. Derives cluster status: `active` if any constituent is active, else `resolved`, else `unknown`
4. Sorts all extracted `observedAt` values to produce `firstSeen`/`lastSeen`
5. Correlates non-incident signals by matching `service` field
6. Sorts clusters by count descending, caps at `maxClusters`

This is a **pure function** with no model, tool, or clock dependency — it can be unit-tested with fixture data.

### Prompts & Tools Management

The system prompt is registered but **not currently invoked**:

```
Summarize only the supplied clustered signal bundle. Cite sig-N IDs for every statement.
Rank active incidents, unresolved tickets, risky deployments, then noise. Say "no data
available for this source" when absent. Never invent alert counts, PR authors, or ticket
statuses.
```

The `modelRef` and `systemPrompt` fields in the agent definition are reserved for a future AI summarization step that will sit between `cluster.analyze` and `brief.summarize`, authoring the highlights, recommended watch items, and a natural-language summary from the clustered data.

---

## User Guide & Interface Walkthrough

### Dashboard Overview

The frontend lives at `/oncall-handover-assistant` and provides a single page with:

1. **HandoverStatusBanner** — live `role="status"` banner showing the current phase (`compiling`, `partial`, `no_activity`, `success`, `error`)
2. **Compile a brief** button — opens the `CompileBriefDialog` form
3. **HandoverRunView** — live graph-node transitions and tool-call activity via SSE
4. **Brief panels** — `IncidentClusterPanel`, `DeploymentsPanel`, and `TicketsPanel` rendering the clustered data

Runs are deep-linked via `?run=<id>` for shareable replay of both on-demand and scheduled briefs.

### Human-in-the-Loop Actions

#### Compiling an on-demand brief

1. Navigate to `/oncall-handover-assistant`
2. Click **Compile a brief**
3. Fill in:
   - **Team** — scopes incident and ticket collection (e.g. `platform`)
   - **Entity references** — comma-separated catalog entity refs for K8s/VCS collection (optional if team is provided)
   - **Trailing window** — hours to look back (default 12)
   - **Incoming engineer** — name displayed in the brief header (optional)
4. Click **Compile**

The page streams live SSE events: graph nodes enter/exit, five parallel collectors complete, clusters are computed, and the brief panels render.

#### Reading the brief

The brief panels show:
- **Incident clusters** — grouped by service/title, with count, first/last-seen times, cluster status, and correlated deployment/PR/ticket IDs
- **Deployments & notable changes** — K8s timeline events and merged PRs from the window
- **Open tickets** — high-priority open tickets with key, summary, and status
- **Highlights** — active clusters ranked by count, each with severity label and citations
- **Recommended watch items** — per-cluster monitoring suggestions
- **Limitations** — any degraded sources, window clamping, or tool failures

#### Replaying a past run

Append `?run=<id>` to the page URL. The run's persisted events replay in order, restoring the complete brief, clusters, and signal bundle.

### Shift-Boundary Scheduling

When `schedule.enabled` is `true`, the backend registers one global scheduler task per configured shift:

1. Each entry in `schedule.shifts` registers a task with the given `cron` expression and `team`
2. At the scheduled time, the task dispatches a `POST agents/oncall-handover-assistant/runs` with `source: 'scheduler'`, the configured `team`, and the default `windowHours`
3. An in-flight mutex prevents overlapping dispatches
4. The dispatched run is fully persisted and replayable like any on-demand run

Guardrails: per-shift cron, in-flight mutex, no scheduler dispatch accesses user identity, briefs are always read-only.

---

## Troubleshooting & FAQs

### Turbo Workspace Resolution

**Symptom**: `yarn typecheck --force` fails with missing exports from `@ai-crew-suite/plugin-kernel-node`.

**Fix**: Ensure the dependency is listed in the backend module's `package.json` as `"workspace:*"` and that you've run `yarn install` after adding it.

### Agent Execution Failures

**"On-call handover requires ai.agents.oncallHandover configuration to be set" at boot**

The module fast-fails at backend startup. Add the minimal config with `model` set.

**Brief shows `no_activity` when I expected data**

The trailing window may not overlap with any events. Check:
- The `team` value matches the team name used in your incident management and project management tools
- The `entityRefs` values match catalog entities that have K8s workloads and source repositories
- The `windowHours` is sufficient to capture recent activity (default 12h)
- The required driver modules are installed and configured (incident management, K8s, VCS, project management)

**Brief shows `partial` for sources I know are configured**

The `limitations` array lists exactly which sources were degraded and why. Common causes:
- A tool invocation returned no results or failed (driver error, permissions, network)
- The window was clamped because the requested `windowHours` exceeded `maxWindowHours`
- A source returned more signals than `maxSignalsPerSource` (the excess is silently dropped)

**Some incident clusters are missing or merged unexpectedly**

The clustering algorithm groups by `service (if present) | summary.toLowerCase()`. Identical summaries for the same service merge into one cluster. Incidents without a `service` field are grouped separately. Incidents that differ only in case or whitespace are merged.

**Shift scheduler dispatched a brief for the wrong team**

Each entry in `schedule.shifts` has its own `team` field. Verify that each shift's `team` matches the team naming convention in your incident management and project management tools. The scheduler dispatches one run per configured shift.

### Frontend Issues

**Page loads but "Compile a brief" button does nothing**

Ensure `playwright/.auth/login.json` exists (created by the CI mock auth step or manually as `{}`). The API client requires Backstage identity credentials.

**Brief panels show no data after compilation**

The run may have produced a `no_activity` brief (zero signals collected). Check the status banner for the brief status. If the brief is `partial`, check the limitations list for which sources failed.

**The brief doesn't include an AI-written summary**

The current implementation is entirely deterministic — the `HandoverBrief` is assembled from clustered and filtered signal data without an LLM call. The `modelRef` in the agent configuration is reserved for a future AI summarization step. Highlights and watch items are built from cluster metadata until that step is implemented.

---

## Roadmap

The following features are planned for future releases once their shared infrastructure dependencies or product requirements are met.

### AI-Powered Brief Summarization

The `modelRef` and `systemPrompt` fields in the agent definition are reserved for a future AI summarization step between `cluster.analyze` and `brief.summarize`. When implemented, the model will:

- Author natural-language highlights from clustered incident data, replacing the current `count× title` format
- Generate contextual recommended watch items based on incident patterns and runbook content
- Produce an executive summary section for the top of the brief
- All AI-authored content will be citation-constrained — every claim must reference a `sig-N` or `cluster-N` ID
- Model failure will fall back to the current deterministic assembly

### Notification & Ticket Dispatch

Gated on write-capable communication and project management tools (`communication.message.post`, `project.ticket.create` / `project.ticket.comment`). Once available:

- Post completed handover briefs to a configured Slack channel at shift change
- Auto-create follow-up tickets for high-severity active incidents identified in the brief
- Notification content remains bounded, redacted, and never includes raw alert payloads or secrets
- Dispatch gated behind explicit config flags (`schedule.notify.enabled`, `schedule.createTickets.enabled`)

### Scheduled Brief History List

Currently, scheduled briefs are only accessible via their deep-linked `?run=<id>` replay path. A `BriefHistoryList` component requires a paginated runs-list endpoint in AI Core. Once available, the frontend will gain:

- A history table on the handover page showing recent scheduled briefs with team, timestamp, status, and incident count
- Filter-by-team and date-range selection

### Playwright End-to-End Test Suite

- `app-config.e2e.yaml` fixture configuration with controlled collector fixture data
- Playwright scenarios covering full happy-path compilation, `no_activity` brief, `partial` degradation, and replay recovery
- Screenshot-based review of cluster panels, deployment list, and ticket display

### Multi-Team Brief Comparison

Accept multiple `team` values in a single request and produce a comparative brief showing per-team activity side by side — useful for multi-team handovers and management reviews.

### Rotation-Aware Scheduling

Integration with on-call rotation data to automatically select the correct team and time window based on the active rotation schedule, eliminating the need for manual per-shift cron configuration.
