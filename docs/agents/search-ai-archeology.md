---
layout: default
title: Search AI Archeology
parent: Other
plugin_name: plugin-ai-agent-backend-search-ai-archeology
subcategory: Developer Productivity
---

# Search AI Archeology

{: .no_toc }

<span class="label label-blue">{{ page.subcategory }}</span>

---

## Summary

The Search AI Archeology plugin answers *"who actually knows this legacy system?"* by running a read-only `knowledge-archeology` workflow that mines **project-ticket triage history** and produces a cited `expertise-matrix` artifact ranking the people with traceable familiarity with a given component. An operator submits one scoped question (with a repository URL or catalog entity reference), and the graph searches a bounded ticket set, fetches ticket detail, and extracts assignee-history and comment-author signals into deterministic, cited familiarity records.

The pipeline is **entirely deterministic and read-only**: evidence extraction, identity labeling, and ranking are all pure functions. **No LLM is invoked** (the model reference and system prompt are reserved for future narrative composition), and the agent's only two tools — `project.ticket.search` and `project.ticket.get` — are both `effect: 'read'`. There are no write tools and no approval gate because there is nothing to approve; the agent cannot contact the people it identifies.

## Key Features

- **Bounded, scoped research requests** — a versioned `ArcheologyRequest` requires a non-empty `question` (capped at `maxQuestionChars`) plus a `repoUrl` or `entityRef` scope; an unscoped question is refused rather than searched org-wide
- **Ticket-triage evidence extraction** — `ticketEvidence()` mines `assigneeHistory` and `comments[].author` from fetched ticket detail into cited `triaged`/`commented` familiarity signals
- **Explicit identity outcomes, never fabricated** — `resolveTicketIdentities()` retains every raw provider actor as an `unresolved` (or configured `offboarded`) identity with its original name/email, rather than guessing a catalog user or team
- **Deterministic familiarity ranking** — `rankExperts()` scores each identity from triage count only (`score = triaged × weightTriaged`), never from skill, merit, or productivity
- **Failure-tolerant, budgeted tool runner** — `HistoryToolRunner` enforces `maxToolInvocations`, a 10s per-call timeout, and records unavailable/failed tools as report limitations instead of failing the run
- **Cited `expertise-matrix` artifact** — every ranked record cites its `ticket-N` evidence IDs; the report always carries an explicit limitation list
- **Not-a-performance-meter framing** — the system prompt, narrative, and UI all state that scores are ticket-triage familiarity evidence only

## Architecture

The plugin follows the standard two-package Backstage agent layout:

- **Backend module** (`@ai-crew-suite/plugin-agent-search-archeology-backend`, `role: backend-plugin-module`, `pluginId: ai-core`) — registers the `ArcheologyGraph` workflow runner (ID `knowledge-archeology`), the `search-ai-archeology` agent with a read-only allow-list of two ticket tools, and a manual trigger (`archeology-research-on-demand`)
- **Frontend plugin** (`@ai-crew-suite/plugin-agent-search-archeology`, `role: frontend-plugin`, `pluginId: search-ai-archeology`) — provides a standalone page at `/search-ai-archeology` with a research dialog, an expertise-matrix panel, and replay via `?run=<id>`

The graph runs a single node — `history.ticket-search` — and emits the `expertise-matrix` artifact.

---

## Getting Started & Prerequisites

### Backstage Version

- Requires a Backstage backend running the `ai-core` plugin and its extension-point system (`agentExtensionPoint`, `triggerExtensionPoint`, `workflowRunnerExtensionPoint` from `@ai-crew-suite/plugin-kernel-node`)

### Agentic Requirements

| Capability | Module | State |
|---|---|---|
| LLM routing & model registry | `plugin-ai-core-backend-module-llm-openai` or `-llm-openrouter` | Required for agent registration; `ai.agents.searchArcheology.model` references a registered model ID (not currently invoked — ranking is deterministic) |
| Ticket triage history | `plugin-ai-core-backend-module-project-management` — `project.ticket.search`, `project.ticket.get` | Required; the only evidence source in v1 |
| Runtime store | `plugin-ai-core-backend-module-runtime-store` | Required for run/artifact persistence and replay |
| Knowledge retrieval (future) | `plugin-ai-core-backend-module-retrieval-augmenter` — `knowledge.retrieve` | Not active in v1; doc/ADR target-isolation is deferred |
| VCS history (future) | `plugin-ai-core-backend-module-vcs` — `vcs.repository.list_commits`, `vcs.pull_request.list` | Not active in v1; commit/blame and PR-reviewer evidence is deferred (the shared contracts do not exist yet) |
| Org graph (future) | `CatalogEntityResolver` — email→`User`→`Group` resolution | Not active in v1; email-to-catalog-user resolution is deferred |

---

## Installation & Setup

### Backend Setup

#### 1. Add the backend module dependency

In `packages/backend-modern/package.json`:

```json
"dependencies": {
  "@ai-crew-suite/plugin-agent-search-archeology-backend": "workspace:^"
}
```

#### 2. Wire the module into the backend

In `packages/backend-modern/src/index.ts` (the legacy `packages/backend-legacy` registers identically):

```ts
backend.add(
  loadBackendFeature(
    import('@ai-crew-suite/plugin-agent-search-archeology-backend'),
  ),
);
```

#### 3. Configure `app-config.yaml`

The module **throws at boot** if `ai.agents.searchArcheology` is missing:

```yaml
ai:
  agents:
    searchArcheology:
      model: search-archeology
```

All other keys are optional. See [Configuration Reference](#configuration-reference) for the full schema.

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
  "@ai-crew-suite/plugin-agent-search-archeology": "workspace:^"
}
```

#### 2. Mount the page

In `packages/app/src/App.tsx`:

```ts
import searchArcheologyPlugin from '@ai-crew-suite/plugin-agent-search-archeology/alpha';

const app = createApp({
  features: [
    // ... existing features ...
    searchArcheologyPlugin,
  ],
});
```

The page is available at `/search-ai-archeology`.

#### 3. Extend App test expectations

In `packages/app/src/App.test.tsx`, add `search-ai-archeology` to the expected plugin list (and mock the `/alpha` import).

---

## Configuration Reference

### Full `app-config.yaml` Schema

```yaml
ai:
  agents:
    searchArcheology:
      # Required
      model: search-archeology

      # Optional, with defaults
      maxQuestionChars: 500      # max research-question length
      maxLookbackYears: 5        # clamp on the research era window
      maxTickets: 40             # cap on tickets searched per run
      maxToolInvocations: 24     # total evidence-tool call budget
      identity:
        treatUnresolvedAsOffboarded: false  # label unresolvable actors as offboarded
      ranking:
        weightTriaged: 1         # per-triage score weight (must be >= 0)
        maxExperts: 10           # ranked expert cap (must be >= 1)
```

`ranking.weightTriaged` must be non-negative and `ranking.maxExperts` must be at least 1; the module **throws at boot** otherwise (`Search archeology ranking configuration is invalid`).

### RBAC & Permissions

The search archeology agent is **read-only by construction**:

- **Manual research** — any Backstage user with access to the `search-ai-archeology` plugin can start a run via `POST agents/search-ai-archeology/runs`
- **No approval gate** — there are no write tools, so there is nothing to approve; the agent cannot contact the people it identifies
- **Per-caller authorization** — ticket reads propagate the requester's credentials through AI Core, so a user cannot read history they could not read directly

---

## Designing & Authoring Workflows (Agent Core)

### Workflow Schema

The agent is registered with the following definition (`agent.ts`):

```ts
{
  id: 'search-ai-archeology',
  modelRef: config.modelRef,            // e.g. 'search-archeology' (reserved)
  workflowRef: 'knowledge-archeology',
  memory: 'none',                        // Each run is a fresh, bounded investigation
  systemPrompt: SEARCH_ARCHEOLOGY_SYSTEM_PROMPT,
  toolIds: ['project.ticket.search', 'project.ticket.get'],
  triggers: [
    { id: 'archeology-research-on-demand', source: 'manual' },
  ],
}
```

### Context Provisioning

A run is triggered by `POST agents/search-ai-archeology/runs` with a versioned, manual request:

```ts
type ArcheologyRequest = {
  version: 1;
  source: 'manual';
  question: string;     // required, capped at maxQuestionChars
  entityRef?: string;   // catalog scope (repoUrl OR entityRef required)
  repoUrl?: string;     // explicit repository scope
  paths?: string[];     // optional target paths (capped at 10)
  since?: string;       // era lower bound (clamped to maxLookbackYears)
  until?: string;       // era upper bound (defaults to now)
  sessionId?: string;   // reserved for future session continuity
};
```

`parseArcheologyQuery()` validates the payload: it requires version 1, a non-empty `question` within `maxQuestionChars`, and either `repoUrl` or `entityRef`; it clamps `since` to the `maxLookbackYears` floor, and filters `paths` to at most 10 entries of ≤512 characters with no `..` traversal. A malformed or unscoped request yields an `error` event and terminates the run.

### Graph Node

The graph runs a single node — `history.ticket-search` — in `ArcheologyGraph.ts`:

| Node | Source | Behaviour |
|---|---|---|
| **history.ticket-search** | `ArcheologyGraph.ts` + `tickets.ts` | Searches tickets via `project.ticket.search`, fetches each ticket's detail via `project.ticket.get`, and extracts triage evidence |

The search text is the research question and the result set is bounded by `maxTickets` (`boundedTickets()`). Each ticket is then fetched for its `assigneeHistory` and `comments` author signals.

### Evidence Extraction

`ticketEvidence()` turns ticket detail into cited `ContributionEvidence` records:

- **`triaged`** — every `assigneeHistory` entry with a `to` actor becomes a triage signal at `changedAt`
- **`commented`** — every `comments[].author` becomes a comment signal at the comment's `createdAt`

Each signal gets a stable `ticket-N` ID and a corresponding `EvidenceRef` (source `ticket`) citing the ticket title and URL.

### Identity Resolution

`resolveTicketIdentities()` collects the distinct provider actors and labels each one explicitly — **without inventing a catalog user or team**:

- With `identity.treatUnresolvedAsOffboarded: true` → `status: 'offboarded'`
- Otherwise → `status: 'unresolved'`

The raw provider identity (`id`, `displayName`, `email`) is preserved on the record. In the current milestone, catalog email→`User`→`Group` resolution is not performed, so the `active`/`moved_team` outcomes never occur and `groupRefs` stays empty — this is recorded as an explicit limitation rather than a silent drop.

### Ranking

`rankExperts()` is a pure, deterministic function:

```
score = triagedCount × weightTriaged
```

Records sort by score descending, then by recency (most recent first), then by actor ID, and are capped at `maxExperts`. The `signals` breakdown exposes `authored`/`reviewed` (always 0 in v1) and `triaged` counts plus `recencyMonths`, keeping the raw numbers auditable.

### The Expertise Matrix Artifact

```ts
type ExpertiseMatrix = {
  question: string;
  scope: { question; entityRef?; repoUrl?; paths; era: { since; until } };
  status: 'complete' | 'partial' | 'truncated' | 'inconclusive' | 'out_of_scope';
  experts: ExpertRecord[];              // non-offboarded ranked candidates
  offboardedContributors: ExpertRecord[];
  narrative: string;
  confidence: 'high' | 'medium' | 'low';
  limitations: string[];
  evidence: EvidenceRef[];
};
```

The current graph emits `status: 'partial'` when any expert or offboarded contributor was found, otherwise `inconclusive`; `confidence` is always `low`; and the `narrative` is a fixed statement that the ranking is ticket-triage familiarity evidence only.

### Prompts & Tools Management

The system prompt is registered but **not currently invoked**:

```
Rank only supplied cited familiarity evidence. Never characterize skill, performance, merit, or productivity. Never invent people, teams, commits, PRs, or tickets. Preserve unresolved and offboarded contributors explicitly.
```

The two allow-listed tools — `project.ticket.search` and `project.ticket.get` — are both `effect: 'read'`. The `modelRef` and `systemPrompt` are reserved for future narrative composition.

---

## User Guide & Interface Walkthrough

### Dashboard Overview

The frontend lives at `/search-ai-archeology` and provides a single page with:

1. **Start research** button — opens a dialog to submit a scoped question
2. **Research progress** — streams the live step node (`history.ticket-search`) as it enters and exits
3. **Expertise matrix panel** — renders the question, status/confidence, familiarity candidates, offboarded contributors, limitations, and evidence citations
4. **Replay** — saved runs are deep-linked via `?run=<id>` and replayed from persisted events

### Human-in-the-Loop Actions

#### Starting research

1. Navigate to `/search-ai-archeology`
2. Click **Start research**
3. Enter a research question (e.g. "Who has triaged payment-reconciliation incidents?") and either a **repository URL** or a **catalog entity reference**
4. Click **Start research** and watch the progress and matrix stream over SSE

#### Reading the matrix

The matrix panel shows:

- **Question, status, and confidence** — e.g. `partial` with `low` confidence
- **Familiarity candidates** — ranked records, each with the actor's name, identity status, triage-signal count, and rationale
- **Offboarded contributors** — contributors labeled `offboarded` (or `unresolved`) rather than silently dropped
- **Research limitations** — the explicit list of unavailable evidence sources
- **Evidence citations** — each `ticket-N` citation links to the source ticket URL

The page header and panel copy both state that scores are ticket-triage familiarity evidence only, not a performance or productivity assessment.

---

## Troubleshooting & FAQs

### Turbo Workspace Resolution

**Symptom**: `yarn typecheck --force` fails with missing exports from `@ai-crew-suite/plugin-kernel-node`.

**Fix**: Ensure the dependency is listed in the backend module's `package.json` as `"workspace:*"` and that you've run `yarn install` after adding it.

### Agent Execution Failures

**"Search archeology requires ai.agents.searchArcheology configuration to be set" at boot**

The module fast-fails at backend startup. Add the minimal config with `model` set.

**"Search archeology ranking configuration is invalid" at boot**

`ranking.weightTriaged` must be non-negative and `ranking.maxExperts` must be at least 1. Correct both and restart.

**A run yields an `error` event instead of a matrix**

The request payload was rejected: it must be version 1 JSON with a non-empty `question` (within `maxQuestionChars`) and a `repoUrl` or `entityRef`. Verify the payload.

**The matrix shows `status: inconclusive`**

No experts or offboarded contributors were found from the available ticket evidence. Try a broader question or confirm ticket tooling is configured.

**Every actor is labeled `unresolved` or `offboarded`**

Catalog email→`User`→`Group` resolution is not active in v1, so all actors retain their raw provider identity. Set `identity.treatUnresolvedAsOffboarded` to control the label.

**A limitation mentions "tool budget exhausted"**

The run hit `maxToolInvocations`. Raise the limit or reduce `maxTickets` to spend fewer detail-fetch calls.

### Frontend Issues

**The "Start research" button stays disabled**

Both a non-empty question and either a repository URL or catalog entity reference are required.

**The page loads but research does nothing**

Ensure Backstage identity credentials are available — the API client attaches a Bearer token to the SSE request.

---

## Roadmap

The following features were **explicitly out of scope** for the ticket-triage v1 milestone and remain planned.

### Knowledge Retrieval (Doc/ADR Target Isolation)

`knowledge.retrieve` over TechDocs/ADRs is planned to isolate target files and components before the history queries run, the "cheap half" of the hybrid strategy. The delivered graph searches tickets directly with no retrieval step.

### VCS Commit/Blame History

The shared `vcs.repository.list_commits` contract does not exist yet (the VCS driver exposes metadata, file read, search, and PR list only). Adding a provider-neutral, time-bounded commit-history op would unlock author-based ranking; the v1 report records `commit history unavailable`.

### PR Reviewer Evidence

`vcs.pull_request.list` currently accepts only `repoUrl` (no window/filter) and `PullRequestSummary` carries no reviewers. Extending both would surface review-participation signals.

### Org-Graph Identity Resolution

`CatalogEntityResolver` would map email → `User` → `memberOf` → `Group` to produce the four explicit outcomes (`active`, `moved_team`, `offboarded`, `unresolved`) and resolve legacy email aliases. v1 labels every actor `unresolved`/`offboarded`.

### Rate-Limit-Resilient Resume

Per-page cursor checkpointing, error classification, `resume()`, and truncation-as-throttling are planned so a `429` mid-run preserves collected evidence and resumes at the history node.

### Never in Scope

The following are architectural guardrails, not roadmap items:

- **No write tools** — no tickets, messages, catalog edits, or PRs; the agent cannot contact the people it identifies
- **No bulk embedding of code diffs** — explicitly rejected as expensive and noisy; history is queried deterministically
- **Not a performance tool** — scores measure traceable familiarity, never merit, skill, or productivity
