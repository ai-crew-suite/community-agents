---
layout: default
title: Release Notes AI Generator
parent: Other
plugin_name: plugin-ai-agent-backend-release-notes-ai-generator
subcategory: Documentation
---

# Release Notes AI Generator

{: .no_toc }

<span class="label label-blue">{{ page.subcategory }}</span>

---

## Summary

The Release Notes AI Generator automates the production of **customer-facing release notes** from merged pull requests. It collects all merged PRs for a repository in a specified time window, deterministically categorizes each change against a configurable taxonomy (`feature`, `fix`, `improvement`, `breaking`, `internal`), filters out internal chores, and produces a structured draft with per-category sections, a cited markdown rendering, and a transparent count of filtered internal changes.

Categorization and inclusion decisions are **entirely deterministic** — the taxonomy matches conventional commit prefixes and configurable keywords against PR titles, and internal chores are filtered before draft assembly. The graph produces a `release-notes-draft` artifact with `chg-N` citations, per-category text, and a copyable markdown block. The approval gate and publish action are built into the agent contract and frontend but **gated on a shared VCS write tool** that is not yet registered.

## Key Features

- **Deterministic categorization** via conventional commit prefixes and configurable keyword taxonomy — `feat` → `feature`, `fix` → `fix`, `improve`/`perf`/`refactor` → `improvement`, `breaking` → `breaking`, `chore`/`ci`/`deps` → `internal`
- **Internal chore filtering** — changes categorized as `internal` are counted and excluded from the customer-facing draft, with the count transparently surfaced in the `filteredCount` field
- **Configurable taxonomy** — every category's keyword set is overridable via `app-config.yaml`, allowing teams to add domain-specific vocabulary
- **Three draft statuses** — `drafted` (clean), `partial` (at least one limitation), `no_changes` (zero customer-facing changes after filtering)
- **Stable citation IDs** — every retained change is assigned a stable `chg-N` ID for citation in markdown output
- **Markdown output** — copyable, sectioned markdown ready for pasting into GitHub Releases, changelogs, or documentation

## Architecture

The plugin follows the standard two-package Backstage agent layout:

- **Backend module** (`@ai-crew-suite/plugin-agent-release-notes-generator-backend`, `role: backend-plugin-module`, `pluginId: ai-core`) — registers the `ReleaseNotesGraph` workflow runner (ID `release-notes`), the `release-notes-ai-generator` agent definition with a read-only allow-list of 4 tools, and manual/scheduler triggers
- **Frontend plugin** (`@ai-crew-suite/plugin-agent-release-notes-generator`, `role: frontend-plugin`, `pluginId: release-notes-ai-generator`) — provides a standalone page at `/release-notes-ai-generator` with a generation dialog, live run progress, categorized draft preview with markdown output, internal-chore filtering panel, and future approval/publication controls

The graph runs four deterministic nodes: `request.validate → changes.collect → changes.categorize → draft.summarize → draft.finalize`. The artifact kind is `release-notes-draft`. The graph is **draft-only and entirely deterministic** — the model is not invoked, and approval/publish are deferred until the shared VCS write contract is available.

---

## Getting Started & Prerequisites

### Backstage Version

- Requires a Backstage backend running the `ai-core` plugin and its extension-point system (`agentExtensionPoint`, `triggerExtensionPoint`, `workflowRunnerExtensionPoint` from `@ai-crew-suite/plugin-kernel-node`)

### Agentic Requirements

| Capability | Module | State |
|---|---|---|
| LLM routing & model registry | `plugin-ai-core-backend-module-llm-openai` or `llm-openrouter` | Required for agent registration; `ai.agents.releaseNotes.model` references a registered model ID (not currently invoked — reserved for future AI copy rewriting) |
| VCS pull requests | `plugin-ai-core-backend-module-vcs` — `vcs.pull_request.list` | Required for PR collection; the only tool actually invoked by the current graph |
| Project management (future) | `plugin-ai-core-backend-module-project-management` — `project.ticket.get`, `project.ticket.search` | Listed in tool allow-list but not yet invoked; reserved for future ticket-linked PR enrichment |
| RAG (future) | `plugin-ai-core-backend-module-retrieval-augmenter` | Listed in tool allow-list but not yet invoked; reserved for prior-release-note style context |
| Runtime store | `plugin-ai-core-backend-module-runtime-store` | Required for run/artifact persistence |

#### Request Validation

A valid `ReleaseNotesRequest` must include `repoUrl` and `targetVersion`. Optional `since`/`until` fields must be valid ISO timestamps if provided.

---

## Installation & Setup

### Backend Setup

#### 1. Add the backend module dependency

In `packages/backend/package.json`:

```json
"dependencies": {
  "@ai-crew-suite/plugin-agent-release-notes-generator-backend": "workspace:^"
}
```

#### 2. Wire the module into the backend

In `packages/backend/src/index.ts`, add alongside other `@ai-crew-suite` module loads:

```ts
import { releaseNotesModule } from '@ai-crew-suite/plugin-agent-release-notes-generator-backend';

// Inside your backend builder:
backend.add(releaseNotesModule);
```

#### 3. Configure `app-config.yaml`

The module **throws at boot** if `ai.agents.releaseNotes.model` is missing. Add at minimum:

```yaml
ai:
  agents:
    releaseNotes:
      model: release-notes
```

See [Configuration Reference](#configuration-reference) for the full schema including taxonomy customization.

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
  "@ai-crew-suite/plugin-agent-release-notes-generator": "workspace:^"
}
```

#### 2. Mount the page

In `packages/app/src/App.tsx`, import the alpha entry point:

```ts
import releaseNotesExtensions from '@ai-crew-suite/plugin-agent-release-notes-generator/alpha';

const app = createApp({
  features: [
    // ... existing features ...
    releaseNotesExtensions,
  ],
});
```

The page is available at `/release-notes-ai-generator`.

#### 3. Extend App test expectations

In `packages/app/src/App.test.tsx`, add the release notes plugin ID (`release-notes-ai-generator`) to the expected plugin list.

---

## Configuration Reference

### Full `app-config.yaml` Schema

All properties except `model` are optional and fall back to documented defaults:

```yaml
ai:
  agents:
    releaseNotes:
      # Required: installation-registered model ID (reserved for future AI copy rewriting)
      model: release-notes

      # --- optional, with defaults ---

      maxPullRequests: 100         # Hard cap on PRs retained in a generated draft
      maxToolInvocations: 8         # Hard cap on tool invocations per run

      # Deterministic categorization taxonomy — every category's keyword list is overridable
      taxonomy:
        feature:                    # Default: ['feat', 'feature']
          - feat
          - feature
        fix:                         # Default: ['fix', 'bugfix', 'bug']
          - fix
          - bugfix
          - bug
        improvement:                 # Default: ['improve', 'enhance', 'perf', 'refactor']
          - improve
          - enhance
          - perf
          - refactor
        breaking:                    # Default: ['breaking change', 'breaking']
          - breaking change
          - breaking
        internal:                    # Default: ['chore', 'ci', 'build', 'deps', 'dependency', 'internal']
          - chore
          - ci
          - build
          - deps
          - dependency
          - internal

      # Cadence scheduling (not yet active — module has no scheduler deps in v1)
      schedule:
        enabled: false              # Kill switch
        cron: '0 17 * * 5'         # Default: Friday 17:00 UTC
        repositories: []            # Repositories to scan

      # Publication switch (ineffective without VCS write tool)
      publish:
        enabled: false
```

### RBAC & Permissions

The generator uses the shared AI Core RBAC model:

- **On-demand generation** — any Backstage user with access to the `release-notes-ai-generator` plugin can generate a draft via `POST agents/release-notes-ai-generator/runs`
- **Approval vote** — future: gated on AI Core's `ApprovalRequest`/`ApprovalDecision` types; only authorized approvers may `POST runs/<id>/approvals`
- **Cadence dispatch** — future: the scheduler service principal will hold plugin-to-plugin auth tokens; cadence runs are always draft-only and never auto-publish

### Taxonomy Matching

Categorization uses **ordered keyword matching** — the first matching category wins:

1. `breaking` — checked first to prevent a breaking change from being classified as a feature
2. `internal` — checked second because chore/dependency PRs often start with conventional prefixes
3. `feature` — matched by `feat`, `feature`
4. `fix` — matched by `fix`, `bugfix`, `bug`
5. `improvement` — fallback for any non-internal, non-breaking, non-feature, non-fix change

Titles are lowercased before matching. Keywords are matched as substrings within the title. Add team-specific keywords to the taxonomy when your team uses non-standard PR title conventions.

---

## Designing & Authoring Workflows (Agent Core)

### Workflow Schema

The release notes agent is registered with the following definition:

```ts
// agent.ts
{
  id: 'release-notes-ai-generator',
  modelRef: config.modelRef,           // e.g. 'release-notes' (reserved for future AI rewriting)
  workflowRef: 'release-notes',
  memory: 'none',                       // Each run is a fresh draft
  systemPrompt: RELEASE_NOTES_SYSTEM_PROMPT,
  toolIds: [
    'vcs.pull_request.list',
    'project.ticket.get',
    'project.ticket.search',
    'knowledge.retrieve',
  ],
  triggers: [
    { id: 'release-notes-on-demand', source: 'manual' },
    { id: 'release-notes-cadence', source: 'scheduler' },
  ],
}
```

### Context Provisioning

A draft is triggered by `POST agents/release-notes-ai-generator/runs` with a `ReleaseNotesRequest` body:

```ts
type ReleaseNotesRequest = {
  version: 1;
  source: 'manual' | 'scheduler';
  repoUrl: string;            // e.g. 'https://github.com/myorg/myrepo'
  targetVersion: string;      // e.g. 'v1.5.0'
  since?: string;             // ISO timestamp; default: 30 days ago
  until?: string;             // ISO timestamp; default: now
};
```

Both `repoUrl` and `targetVersion` are required. `since`/`until` default to a trailing 30-day window when omitted.

### Graph Nodes

The graph runs five deterministic nodes. **No LLM is invoked** — the entire draft is assembled from categorized PR data:

| Node | Source | Behaviour |
|---|---|---|
| **request.validate** | `request.ts` | Parses the JSON payload, validates `repoUrl` and `targetVersion` are non-empty strings, and validates optional `since`/`until` are ISO timestamps |
| **changes.collect** | `collectors.ts` | Invokes `vcs.pull_request.list` for the repository, filters to `state === 'merged'`, caps at `maxPullRequests`, and maps each PR to a `ChangeItem` with stable `chg-N` IDs via `categorizeTitle()` |
| **changes.categorize** | `categorize.ts` | Runs `filterCustomerChanges()` which separates `internal`-category items (counted but excluded) from customer-facing categories (`feature`, `fix`, `improvement`, `breaking`) |
| **draft.summarize** | `draft.ts` | Builds the `ReleaseNotesDraft` deterministically: groups changes by category, joins summaries per category, generates a markdown block with per-section headings and citation lists, and derives draft status from change count + limitations |
| **draft.finalize** | `ReleaseNotesArtifactWriter` | Emits the `release-notes-draft` artifact and the `done` event |

### Deterministic Categorization

The `categorizeTitle()` function in `categorize.ts`:

1. Lowercases the PR title
2. Checks `breaking` keywords first (prevents a breaking change from being misclassified)
3. Checks `internal` keywords second (chore/deps PRs often use conventional prefixes)
4. Matches `feature`, then `fix`, then falls back to `improvement`
5. **All categories are configurable** through the `taxonomy` config block — add team-specific keywords

`filterCustomerChanges()` then splits the result: `internal` items are counted (`filteredCount`) and excluded, while all others pass through to the customer-facing draft.

### The Artifact

The `ReleaseNotesDraft` artifact contains:

```ts
type ReleaseNotesDraft = {
  repoUrl: string;
  targetVersion: string;
  window: { since?: string; until?: string };
  status: 'drafted' | 'partial' | 'no_changes';
  sections: { category: 'feature' | 'fix' | 'improvement' | 'breaking'; text: string; citations: string[] }[];
  markdown: string;                     // Copyable, citation-annotated markdown
  includedChanges: ChangeItem[];         // All non-internal changes with stable chg-N IDs
  filteredCount: number;                // Count of internal changes excluded
  limitations: string[];
};
```

### Prompts & Tools Management

The system prompt is registered but **not currently invoked**:

```
Rewrite only the deterministically included changes into customer-facing release notes.
Every note must cite one or more supplied chg-N IDs. Never include internal chores,
invent versions, authors, tickets, or changes not present in the supplied bundle.
```

The `modelRef`, `systemPrompt`, and additional tool IDs (`project.ticket.get`, `project.ticket.search`, `knowledge.retrieve`) are registered for future use:
- **AI copy rewriting** — the model will rewrite PR titles into polished, customer-facing summary text
- **Ticket enrichment** — `project.ticket.get`/`project.ticket.search` will resolve linked ticket keys for richer descriptions
- **Style context** — `knowledge.retrieve` will provide prior release-note style/formatting for consistency

All three enhancements are gated on shared driver availability and are not active in the current implementation.

---

## User Guide & Interface Walkthrough

### Dashboard Overview

The frontend lives at `/release-notes-ai-generator` and provides a single page with:

1. **Generate button** — opens the `GenerateNotesDialog` form
2. **ReleaseNotesRunView** — live graph-node transitions via SSE
3. **DraftPreview** — per-category sections with change summaries and citation badges, plus a copyable markdown panel
4. **FilteredChangesPanel** — transparent display of internal changes that were counted and excluded, with the `filteredCount` prominently shown
5. **ApprovalBar** (future) — approve/reject controls that appear when a real `approval_request` SSE event arrives
6. **PublicationBanner** (future) — shows the published release URL or confirms rejection

Runs are deep-linked via `?run=<id>` for shareable replay.

### Human-in-the-Loop Actions

#### Generating a draft

1. Navigate to `/release-notes-ai-generator`
2. Click **Generate release notes**
3. Fill in:
   - **Repository URL** — required, e.g. `https://github.com/myorg/myrepo`
   - **Target version** — required, e.g. `v1.5.0`
   - **Since** — optional ISO timestamp (default: 30 days ago)
   - **Until** — optional ISO timestamp (default: now)
4. Click **Generate**

The page streams live SSE events: graph nodes enter/exit, the PR collection completes, categorization runs, and the draft renders with per-category sections and markdown output.

#### Reviewing the draft

The `DraftPreview` displays:
- **Per-category sections** — `Breaking changes`, `Features`, `Improvements`, `Fixes` (only categories with changes are shown)
- **Change citations** — each change carries its `chg-N` ID for traceability
- **Markdown output** — a copyable block with `## category` headings and citation annotations, ready for pasting into GitHub Releases

The `FilteredChangesPanel` shows:
- **Filtered count** — number of `internal`-category changes excluded from the draft
- **Filtered changes** — individual PR titles that were categorized as internal chores, providing full transparency into what was excluded and why

#### Handling different draft statuses

- **`drafted`** — the draft is complete with no limitations; all sources responded successfully
- **`partial`** — at least one limitation is present (e.g., `publish.enabled` was set without the VCS write tool); the draft content is still usable
- **`no_changes`** — zero customer-facing changes were found after filtering; either the repository had no merged PRs, all PRs were internal chores, or the time window did not overlap any activity

#### Replaying a past run

Append `?run=<id>` to the page URL. The run's persisted events replay in order, restoring the complete draft, filtering panel, and limitations.

---

## Troubleshooting & FAQs

### Turbo Workspace Resolution

**Symptom**: `yarn typecheck --force` fails with missing exports from `@ai-crew-suite/plugin-kernel-node`.

**Fix**: Ensure the dependency is listed in the backend module's `package.json` as `"workspace:*"` and that you've run `yarn install` after adding it.

### Agent Execution Failures

**"Release notes requires ai.agents.releaseNotes configuration to be set" at boot**

The module fast-fails at backend startup. Add the minimal config with `model` set.

**Draft shows `no_changes` when I know there were merged PRs**

Check that:
- The `repoUrl` matches the repository exactly (case-sensitive, including the full HTTPS URL)
- The VCS driver can access the repository (credentials, permissions, network)
- The PRs were merged (the collector filters to `state === 'merged'` — open or closed-without-merge PRs are excluded)
- The PRs were not all categorized as `internal` — check the `FilteredChangesPanel` to see what was excluded

**All changes end up as `improvement` instead of `feature` or `fix`**

The taxonomy matches keywords as substrings within lowercased PR titles. If your team's PR title conventions don't match the default keywords, customize the `taxonomy` block in `app-config.yaml`:

```yaml
ai:
  agents:
    releaseNotes:
      taxonomy:
        feature: ['feat', 'feature', 'new']
        fix: ['fix', 'bugfix', 'bug', 'hotfix', 'patch']
```

Also note that `breaking` and `internal` are checked **before** `feature`/`fix`/`improvement`. A PR titled `fix: breaking change in API` will be classified as `breaking` (not `fix`), and a PR titled `feat: update dependencies` will be classified as `internal` (not `feature`) if the `deps`/`dependency` keywords match.

**The draft doesn't include AI-generated summaries**

The current implementation is entirely deterministic — the `ReleaseNotesDraft` is assembled from PR titles directly, without an LLM call. The `modelRef` and `systemPrompt` in the agent definition are reserved for a future AI copy rewriting step. When that step is implemented, the model will rewrite PR titles into polished customer-facing descriptions while citing each `chg-N` ID.

**Approval bar and publication banner never appear**

These components are built for the future publish milestone. The current backend is draft-only — there is no VCS write tool, so no `approval_request` SSE event is ever emitted. The page correctly hides these controls rather than fabricating a gate. When the shared `vcs.release.publish` write tool lands, these controls will activate automatically.

### Frontend Issues

**Page loads but "Generate release notes" does nothing**

Ensure `playwright/.auth/login.json` exists. The API client requires Backstage identity credentials.

**The markdown output looks bare — no hyperlinks or formatting**

The current markdown generator uses PR titles as-is. Future AI copy rewriting will produce richer descriptions. For now, the markdown provides a structured starting point that can be edited before publishing.

---

## Roadmap

The following features are planned for future releases once their shared infrastructure dependencies or product requirements are met.

### AI-Powered Copy Rewriting

The `modelRef` and `systemPrompt` fields in the agent definition are reserved for a future AI summarization step between `draft.summarize` and `draft.finalize`. When implemented, the model will:

- Rewrite PR titles into polished, customer-facing summary text while citing each `chg-N` ID
- Merge related changes within the same category into coherent paragraphs
- Generate an executive summary section at the top of the draft
- All AI-authored content will be citation-constrained — every claim must reference at least one `chg-N` ID
- Model failure will fall back to the current deterministic assembly

### Ticket-Linked PR Enrichment

The `project.ticket.get` and `project.ticket.search` tools are registered in the agent allow-list but not yet invoked. When the project management module's driver is available and configured:

- Resolve linked Jira/Linear/Asana ticket keys from PR titles and branch names
- Fetch ticket summaries, types, and priorities to provide richer context per change
- Surface ticket references alongside `chg-N` citations in the draft markdown

### Prior Release Notes Style Context

The `knowledge.retrieve` tool is registered for future RAG-based style consistency. When the retrieval-augmenter module is configured:

- Retrieve prior release notes for the same repository to match formatting, tone, and section conventions
- Generate drafts that are stylistically consistent with the team's historical release notes

### Approval Gate & VCS Publish

This is the **first write-capable workflow** in the plugin series. Gated on `vcs.release.publish` (`effect: 'write'`). Once the shared write tool lands:

- The graph will emit a real `approval_request` SSE event after the draft is finalized
- After a human `approved` decision, the graph will publish the release notes to the repository
- The frontend's `ApprovalBar` and `PublicationBanner` components (already built) will activate automatically
- `publish.enabled` will switch from recording a limitation to enabling the actual publish path

### Cadence Scheduling

The `schedule` config block and `release-notes-cadence` trigger are registered, but the module does not yet have scheduler dependencies. When cadence scheduling is implemented:

- Register a `coreServices.scheduler` task for each configured repository
- Dispatch draft-only runs at the configured cron intervals (default: Fridays 17:00)
- Cadence runs are always draft-only and never auto-publish
- An in-flight mutex prevents overlapping dispatches

### Cross-Repository Aggregation

Accept multiple `repoUrl` values in a single request and produce a unified release notes draft spanning multiple repositories — useful for monorepo releases and multi-service version bumps.

### Playwright E2E Test Suite

- `app-config.e2e.yaml` fixture backend with controlled VCS fixture data
- Playwright scenarios covering full happy-path generation, `no_changes` draft, `partial` degradation with internal filtering, and replay recovery
- Screenshot-based review of the categorized draft preview, filtered changes panel, and markdown output
