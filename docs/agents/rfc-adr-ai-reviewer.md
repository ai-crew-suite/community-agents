---
layout: default
title: RFC / ADR AI Reviewer
parent: Other
plugin_name: plugin-ai-agent-backend-rfc-adr-ai-reviewer
subcategory: Governance
---

# RFC / ADR AI Reviewer

{: .no_toc }

<span class="label label-blue">{{ page.subcategory }}</span>

---

## Summary

The RFC / ADR AI Reviewer is an advisory architecture-governance gate that evaluates design documents (RFCs and Architecture Decision Records) through two parallel review channels — a **Senior Architect** node and a **Security Lead** node — and compiles a unified `DesignCritique` artifact with a verdict (`block`, `comment`, or `approve`) and cited findings from both perspectives.

The review is **entirely deterministic and read-only**: the graph reads the document from the source repository, extracts component/API references, redacts credential-like values, runs both review channels concurrently, and merges their findings into a single critique. The Senior Architect channel retrieves architecture standards from the knowledge base and checks for deprecated references. The Security Lead channel validates the document against enterprise architecture compliance rules and policy evaluations. Both channels produce cited findings keyed to evidence IDs. No LLM is invoked — the model reference in the agent definition is reserved for future AI-powered debate synthesis.

## Key Features

- **Parallel dual-channel review** — Senior Architect and Security Lead channels run concurrently via `Promise.all`, each emitting independently tagged step nodes (`senior-architect`, `security-lead`, `compilation`)
- **Deterministic verdict derivation** — `critical` or `high` findings produce `block`; medium/low findings produce `comment`; zero cited findings produce `approve`
- **Path-gated document validation** — the request parser rejects any path not under `adr/` or `rfc/`, ensuring only design documents are reviewed
- **Compliance tool integration** — `compliance.architecture.validate` and `compliance.policy.evaluate` run in parallel for the security review, with both architecture violations and policy violations surfaced as cited findings
- **Credential redaction** — `token`, `password`, `secret`, and `api_key` assignment values are redacted from the document before it enters review context
- **Evidence-keyed findings** — `buildDesignCritique()` filters findings to only those whose citations match retained evidence IDs, preventing orphaned claims

## Architecture

The plugin follows the standard two-package Backstage agent layout:

- **Backend module** (`@ai-crew-suite/plugin-agent-rfc-adr-reviewer-backend`, `role: backend-plugin-module`, `pluginId: ai-core`) — registers the `ReviewGraph` workflow runner (ID `rfc-adr-review`), the `rfc-adr-ai-reviewer` agent definition with a read-only allow-list of 5 tools, and a single manual trigger
- **Frontend plugin** (`@ai-crew-suite/plugin-agent-rfc-adr-reviewer`, `role: frontend-plugin`, `pluginId: rfc-adr-ai-reviewer`) — provides a standalone page at `/rfc-adr-ai-reviewer` with a start-review dialog, a debate view showing per-channel activity, a critique panel with severity-ordered findings, and future approval/publication controls

The graph runs with three paired-step phases: `document.read` validates and redacts the document, then `senior-architect` and `security-lead` execute concurrently via `Promise.all` (yielding per-channel enter/exit events), and finally `compilation` merges the results and derives the verdict. The artifact kind is `design-critique`.

---

## Getting Started & Prerequisites

### Backstage Version

- Requires a Backstage backend running the `ai-core` plugin and its extension-point system (`agentExtensionPoint`, `triggerExtensionPoint`, `workflowRunnerExtensionPoint` from `@ai-crew-suite/plugin-kernel-node`)

### Agentic Requirements

| Capability | Module | State |
|---|---|---|
| LLM routing & model registry | `plugin-ai-core-backend-module-llm-openai` or `llm-openrouter` | Required for agent registration; `ai.agents.rfcAdrReviewer.model` references a registered model ID (not currently invoked — reserved for future AI debate synthesis) |
| VCS repository read | `plugin-ai-core-backend-module-vcs` — `vcs.repository.read_file` | Required for document retrieval |
| Compliance architecture | `plugin-ai-core-backend-module-compliance` — `compliance.architecture.validate` | Required for Security Lead architecture validation |
| Compliance policy | `plugin-ai-core-backend-module-compliance` — `compliance.policy.evaluate` | Required for Security Lead policy evaluation |
| Knowledge retrieval | `plugin-ai-core-backend-module-retrieval-augmenter` | Required for Senior Architect standards retrieval |
| Runtime store | `plugin-ai-core-backend-module-runtime-store` | Required for run/artifact persistence |

---

## Installation & Setup

### Backend Setup

#### 1. Add the backend module dependency

In `packages/backend/package.json`:

```json
"dependencies": {
  "@ai-crew-suite/plugin-agent-rfc-adr-reviewer-backend": "workspace:^"
}
```

#### 2. Wire the module into the backend

In `packages/backend/src/index.ts`, add alongside other `@webstackbuilders` module loads:

```ts
import { rfcAdrReviewerModule } from '@ai-crew-suite/plugin-agent-rfc-adr-reviewer-backend';

// Inside your backend builder:
backend.add(rfcAdrReviewerModule);
```

#### 3. Configure `app-config.yaml`

The module **throws at boot** if `ai.agents.rfcAdrReviewer.model` is missing:

```yaml
ai:
  agents:
    rfcAdrReviewer:
      model: rfc-adr-reviewer
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
  "@ai-crew-suite/plugin-agent-rfc-adr-reviewer": "workspace:^"
}
```

#### 2. Mount the page

In `packages/app/src/App.tsx`, import the alpha entry point:

```ts
import rfcAdrReviewerExtensions from '@ai-crew-suite/plugin-agent-rfc-adr-reviewer/alpha';

const app = createApp({
  features: [
    // ... existing features ...
    rfcAdrReviewerExtensions,
  ],
});
```

The page is available at `/rfc-adr-ai-reviewer`.

#### 3. Extend App test expectations

In `packages/app/src/App.test.tsx`, add the reviewer plugin ID (`rfc-adr-ai-reviewer`) to the expected plugin list.

---

## Configuration Reference

### Full `app-config.yaml` Schema

All properties except `model` are optional and fall back to documented defaults:

```yaml
ai:
  agents:
    rfcAdrReviewer:
      # Required: installation-registered model ID (reserved for future AI debate synthesis)
      model: rfc-adr-reviewer

      # --- optional, with defaults ---

      maxDocumentCharacters: 20000   # Hard cap on document size before review
      maxFindings: 20                # Max findings retained in the critique artifact
      maxToolInvocations: 8          # Hard cap on tool invocations across both channels

      # Publication switch (ineffective without VCS write tool)
      publish:
        enabled: false
```

### RBAC & Permissions

The reviewer uses the shared AI Core RBAC model:

- **Manual review** — any Backstage user with access to the `rfc-adr-ai-reviewer` plugin can start a review via `POST agents/rfc-adr-ai-reviewer/runs`
- **Approval vote** — future: gated on AI Core's `ApprovalRequest`/`ApprovalDecision` types; only authorized approvers may `POST runs/<id>/approvals`
- **No event-driven or scheduled triggers** are registered yet; only the manual `rfc-adr-review-on-demand` trigger exists

### Request Validation

A valid `ReviewRequest` must include:
- `repoUrl` — non-empty string identifying the repository
- `path` — must start with `adr/` or `rfc/` (case-insensitive regex check)
- Optional `ref` — a Git ref (branch, tag, SHA) to read the document at
- Optional `pullRequestId` — accepted but not yet used (reserved for future PR comment posting)

---

## Designing & Authoring Workflows (Agent Core)

### Workflow Schema

The reviewer agent is registered with the following definition:

```ts
// agent.ts
{
  id: 'rfc-adr-ai-reviewer',
  modelRef: config.modelRef,           // e.g. 'rfc-adr-reviewer' (reserved for future AI use)
  workflowRef: 'rfc-adr-review',
  memory: 'none',                       // Each run is a fresh review
  systemPrompt: RFC_ADR_REVIEWER_SYSTEM_PROMPT,
  toolIds: [
    'vcs.repository.read_file',
    'vcs.repository.get_metadata',
    'compliance.architecture.validate',
    'compliance.policy.evaluate',
    'knowledge.retrieve',
  ],
  triggers: [
    { id: 'rfc-adr-review-on-demand', source: 'manual' },
  ],
}
```

### Context Provisioning

A review is triggered by `POST agents/rfc-adr-ai-reviewer/runs` with a `ReviewRequest` body:

```ts
type ReviewRequest = {
  version: 1;
  source: 'manual' | 'events';
  repoUrl: string;            // e.g. 'https://github.com/myorg/architecture'
  path: string;                // Must start with adr/ or rfc/, e.g. 'adr/0012-use-kafka.md'
  ref?: string;               // Git ref to read at (branch, tag, SHA)
  pullRequestId?: string;     // Reserved for future PR comment posting
};
```

The path is validated with `/^(adr|rfc)\//i` — requests for files outside `adr/` or `rfc/` are rejected.

### Graph Nodes

The graph runs with three phases:

| Phase | Nodes | Behaviour |
|---|---|---|
| **document.read** | `request.ts` + `document.ts` + `ReviewGraph.ts` | Parses and validates the request, invokes `vcs.repository.read_file` to fetch the document, redacts credential values via `redactDocument()`, extracts `component:`/`api:` references via `extractReferences()`, and caps document length to `maxDocumentCharacters` |
| **parallel review** | `seniorArchitect.ts` + `securityLead.ts` | Both channels run concurrently via `Promise.all`. The Senior Architect calls `knowledge.retrieve` for architecture standards (up to 3 items) and checks for the word `deprecated` in the document. The Security Lead calls `compliance.architecture.validate` and `compliance.policy.evaluate` in parallel sub-promises, mapping every violation to a cited finding at the violation's severity level |
| **compilation** | `critique.ts` | Merges findings from both channels, filters to only those whose citations match retained evidence IDs, caps at `maxFindings`, derives the verdict from the highest remaining severity, and records limitations for missing shared contracts (`vcs.pull_request.comment`, `CatalogEntityResolver`) |

### The Senior Architect Channel

The `reviewArchitecture()` function:

1. Calls `knowledge.retrieve` with a query built from the document path and extracted references, scoped to `source: 'catalog'`
2. Retains up to 3 knowledge items as `arch-knowledge-N` evidence with ID pattern `arch-knowledge-{n}`
3. Scans the document for the word `deprecated` (case-insensitive) and emits a `high`-severity finding when found, citing both `document-1` and the first knowledge evidence item
4. Returns `{ evidence, findings }` — findings may be empty if no deprecated references are detected

### The Security Lead Channel

The `reviewSecurity()` function:

1. Calls `compliance.architecture.validate` and `compliance.policy.evaluate` concurrently via `Promise.all`
2. Maps each `ArchitectureValidationResult.violations[]` entry to a cited finding with ID pattern `security-finding-{n}`, channel `security-lead`
3. Maps each `PolicyEvaluationResult.violations[]` entry similarly, with severity derived from the violation's `severity` field (`critical` → `critical`, everything else → `high`)
4. Every finding cites `document-1` plus its paired evidence ID
5. Returns `{ evidence, findings }`

### Verdict Derivation

The `verdictFor()` function in `critique.ts` maps findings to verdicts with a simple severity ceiling:

| Highest Severity | Verdict |
|---|---|
| `critical` or `high` | `block` |
| `medium` or `low` (any count) | `comment` |
| No findings | `approve` |

### Prompts & Tools Management

The system prompt is registered but **not currently invoked**:

```
Review only the supplied RFC/ADR document and evidence. Every finding must cite
evidence IDs. Never invent entities, policies, or compliance results. This workflow
is advisory and read-only.
```

The `modelRef` and `systemPrompt` are reserved for a future AI-powered debate synthesis step that will replace the current deterministic pattern-matching with model-authored findings across both channels.

---

## User Guide & Interface Walkthrough

### Dashboard Overview

The frontend lives at `/rfc-adr-ai-reviewer` and provides a single page with:

1. **Start a review** button — opens the `StartReviewDialog` form
2. **DebateView** — live per-channel activity display showing findings as they are produced by each parallel channel, with independently tagged step events (`senior-architect`, `security-lead`)
3. **CritiquePanel** — verdict badge, severity-ordered `FindingCard` components with channel labels, citation expansion, and missing-evidence labelling
4. **ApprovalBar** (future) — approve/reject controls that render only when a real `approval_request` SSE event arrives
5. **PublicationBanner** (future) — shows the published PR comment URL or confirms rejection

Runs are deep-linked via `?run=<id>` for shareable replay.

### Human-in-the-Loop Actions

#### Starting a review

1. Navigate to `/rfc-adr-ai-reviewer`
2. Click **Start a review**
3. Fill in:
   - **Repository URL** — required, e.g. `https://github.com/myorg/architecture`
   - **Document path** — required, must start with `adr/` or `rfc/`, e.g. `adr/0012-use-kafka.md`
   - **Git ref** — optional branch, tag, or SHA to read at (default: default branch)
   - **Pull request ID** — optional, reserved for future PR comment posting
4. Click **Review**

The page streams live SSE events: the document is fetched and validated, both channels execute concurrently (each producing its own per-channel step enter/exit events and findings), and the critique panel renders with the merged verdict and severity-ordered findings.

#### Reading the critique

The `CritiquePanel` displays:
- **Verdict badge** — `block`, `comment`, or `approve`
- **Finding cards** — each showing the channel label (`Senior Architect` or `Security Lead`), severity badge, summary text, and expandable citations with evidence references
- **Limitations** — any degraded sources or missing shared contracts

The `DebateView` shows the per-channel activity timeline, allowing reviewers to see which findings came from which channel and when.

#### Understanding the verdict

- **`block`** — at least one `critical` or `high` severity finding; the document should not proceed without addressing the finding
- **`comment`** — only `medium` or `low` severity findings exist; the document can proceed, but review the findings first
- **`approve`** — no cited findings survived evidence validation; the document passed all automated checks

A `block` verdict should be treated as a strong advisory, not a hard CI gate — the reviewer cannot merge or reject PRs. Editorial decisions remain with the human reviewer.

#### Replaying a past run

Append `?run=<id>` to the page URL. The run's persisted events replay in order, restoring the complete critique, per-channel findings, and evidence bundle.

---

## Troubleshooting & FAQs

### Turbo Workspace Resolution

**Symptom**: `yarn typecheck --force` fails with missing exports from `@ai-crew-suite/plugin-kernel-node`.

**Fix**: Ensure the dependency is listed in the backend module's `package.json` as `"workspace:*"` and that you've run `yarn install` after adding it.

### Agent Execution Failures

**"RFC/ADR reviewer requires ai.agents.rfcAdrReviewer configuration to be set" at boot**

The module fast-fails at backend startup. Add the minimal config with `model` set.

**Request rejected: "path must identify a document under adr/ or rfc/"**

The path validator requires files to start with `adr/` or `rfc/` (case-insensitive). Ensure the document you're trying to review lives in one of those directories. Documents in `docs/`, `designs/`, or the repository root will be rejected — this is intentional to scope reviews to formal design documents only.

**Critique shows `approve` verdict when I expected findings**

The compilation step filters findings to only those whose citations match retained evidence IDs. If a channel produced findings but the evidence IDs were not retained (tool failures, empty responses, or the evidence cap), those findings are dropped. Check the `limitations` array for clues about which tools failed to produce evidence.

**Only one channel produced findings**

If a channel's tools returned no results:
- **Senior Architect**: `knowledge.retrieve` may return empty if no architecture standards are indexed for the referenced components
- **Security Lead**: `compliance.architecture.validate` or `compliance.policy.evaluate` may return no violations if the document is compliant, or may fail if the compliance module is not configured

Tool failures are non-fatal — the channel simply produces no findings, and the compilation continues with whatever was gathered.

**"Catalog entity validation is unavailable" in every critique**

This is a recorded limitation for the missing `CatalogEntityResolver` contract. The reviewer cannot validate that component references in the document actually exist in the Backstage catalog until this shared contract is registered. The limitation is advisory and does not affect the verdict.

**Approval bar and publication banner never appear**

These components are built for the future publish milestone. The current backend is read-only and draft-only — there is no VCS write tool (`vcs.pull_request.comment`), so no `approval_request` SSE event is ever emitted. The page correctly hides these controls rather than fabricating a gate.

### Frontend Issues

**Page loads but "Start a review" does nothing**

Ensure `playwright/.auth/login.json` exists. The API client requires Backstage identity credentials.

**DebateView shows empty channels**

If both channels produced no findings and no tool failures, the critique verdict will be `approve` with an empty findings list. This is a valid outcome — the document passed all automated checks.

---

## Roadmap

The following features are planned for future releases once their shared infrastructure dependencies or product requirements are met.

### AI-Powered Debate Synthesis

The `modelRef` and `systemPrompt` fields in the agent definition are reserved for a future AI-powered review step that will replace the current deterministic pattern-matching. When implemented:

- Both the Senior Architect and Security Lead channels will invoke the model with channel-specific prompts, producing richer, context-aware findings beyond simple keyword matching
- The model will cross-reference document content against the full knowledge base and compliance rule sets
- Findings will include detailed justifications and recommended actions, not just violation messages
- The model will respect the same citation constraint — every finding must cite retained evidence IDs
- Model failure will fall back to the current deterministic channels

### Event-Driven Trigger Ingestion

The `ReviewRequest` schema supports `source: 'events'`, but no event-driven trigger is registered. When the shared event-service subscription integration is available:

- Register a `repo-push` or `pull-request-opened` event listener that detects new or modified files under `adr/`/`rfc/`
- Automatically dispatch a review run when a design document is added or updated
- Event-triggered runs are always draft-only and pause at the critique artifact — never auto-publish

### Approval Gate & PR Comment Publishing

Gated on `vcs.pull_request.comment` (`effect: 'write'`) and `CatalogEntityResolver`. Once both shared contracts are available:

- After the critique is compiled, the graph will emit a real `approval_request` SSE event
- The frontend's `ApprovalBar` will render, allowing the reviewer to approve or reject posting
- On `approved`, the graph will post the critique as a PR comment using `vcs.pull_request.comment`
- On `rejected`, no comment is posted and the event is recorded
- The `PublicationBanner` will display the PR comment URL or confirm rejection

### Catalog Entity Cross-Validation

Gated on `CatalogEntityResolver`. When available, the Senior Architect channel will:

- Resolve each `component:` and `api:` reference extracted from the document against the Backstage catalog
- Verify that referenced components exist, are not deprecated, and have active owners
- Surface missing or stale references as findings in the critique
- This replaces the current `CatalogEntityResolver` limitation with actual catalog-backed validation

### Scheduled Architecture Sweeps

Register a scheduler task that periodically scans all `adr/` and `rfc/` directories across configured repositories and dispatches review runs for any documents that have changed since the last sweep. Sweeps are always draft-only and never auto-publish.

### Playwright E2E Test Suite

- `app-config.e2e.yaml` fixture backend with controlled VCS and compliance fixture data
- Playwright scenarios covering full happy-path review, `block`/`comment`/`approve` verdicts, channel-specific findings rendering, and replay recovery
- Screenshot-based review of the debate view, critique panel, and finding cards
