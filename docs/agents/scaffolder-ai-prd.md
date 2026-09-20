---
layout: default
title: Scaffolder AI PRD Translator
parent: Scaffolder
plugin_name: plugin-ai-agent-backend-scaffolder-ai-prd
subcategory: Automation
---

# Scaffolder AI PRD Translator

{: .no_toc }

<span class="label label-blue">{{ page.subcategory }}</span>

---

## Summary

The Scaffolder AI PRD Translator turns a raw Product Requirements Document into a structured **DeliveryBlueprint** artifact spanning three domains: product management (an epic and story hierarchy), engineering (a selected Scaffolder template), and documentation (a file/section outline). The graph splits the PRD text into citable `prd-N` spans by line, runs three parallel channels over those spans, and merges their outputs into a single blueprint with a SHA-256 hash for content integrity.

The pipeline is **entirely deterministic and runs with zero external dependencies**: all three channels use `Promise.resolve()` with data derived purely from the parsed PRD text. **No LLM is invoked, no tools are called, and no external services are contacted.** The PRD spans are restructured into an epic (first span), stories (subsequent spans up to `maxStories`), a template selection (first allow-listed template), and a documentation outline (hardcoded `docs/architecture.md`). The model reference and tool allow-list are reserved for future AI-powered enrichment of each channel.

## Key Features

- **Line-based PRD segmentation** — raw PRD text is split by newlines into citable `prd-N` spans, each assigned a stable citation ID
- **Three-channel parallel blueprint** — Product Manager (epic + stories), Engineer (template selection), and Technical Writer (documentation outline) channels run concurrently
- **Deterministic channel synthesis** — every channel output is a pure function of the parsed spans with no model call:
  - **PM**: first span → epic title/description; subsequent spans → `story-N` entries (capped at `maxStories`, default 8)
  - **Engineer**: first allow-listed template with score 1.0; no parameter coercion
  - **Writer**: hardcoded `docs/architecture.md` with Overview, Requirements, and Open questions sections
- **SHA-256 blueprint hash** — the merged blueprint is hashed for content-integrity verification and future idempotency
- **Evidence-keyed citations** — every epic, story, template, and documentation item cites the `prd-N` spans it was derived from
- **Blueprint-only status** — the current implementation produces `status: blueprint_only` with a persistent limitation recording that approval, ticket creation, task execution, catalog validation, and documentation publishing are not yet active

## Architecture

The plugin follows the standard two-package Backstage agent layout:

- **Backend module** (`@ai-crew-suite/plugin-agent-scaffolder-prd-backend`, `role: backend-plugin-module`, `pluginId: ai-core`) — registers the `PrdGraph` workflow runner (ID `scaffolder-prd`) with no external service dependencies; the agent definition has 4 read-only tools (all unused) and a single manual trigger
- **Frontend plugin** (`@ai-crew-suite/plugin-agent-scaffolder-prd`, `role: frontend-plugin`, `pluginId: scaffoldinger-ai-prd`) — provides a standalone page at `/scaffolder-ai-prd` with a PRD submission form and a `BlueprintPanel` showing the three-channel output

The graph runs with a parallel fan-out pattern: `pm || engineer || writer` → `join.merge`. All three channels are `Promise.resolve()` with deterministic data derived from parsed PRD spans. The artifact kind is `delivery-blueprint`.

---

## Getting Started & Prerequisites

### Backstage Version

- Requires a Backstage backend running the `ai-core` plugin and its extension-point system

### Agentic Requirements

| Capability | Module | State |
|---|---|---|
| LLM routing & model registry | `plugin-ai-core-backend-module-llm-openai` or `llm-openrouter` | Required for agent registration; model not currently invoked — all channel synthesis is deterministic |
| Project tickets (future) | `plugin-ai-core-backend-module-project-management` — `project.ticket.search`, `project.ticket.get` | Listed in tool allow-list but not invoked; reserved for future epic/duplicate detection |
| VCS (future) | `plugin-ai-core-backend-module-vcs` — `vcs.repository.read_file` | Listed in tool allow-list but not invoked; reserved for existing-documentation reads |
| RAG (future) | `plugin-ai-core-backend-module-retrieval-augmenter` | Listed in tool allow-list but not invoked; reserved for prior-PRD/standards context |
| Runtime store | `plugin-ai-core-backend-module-runtime-store` | Required for run/artifact persistence |

### External Backend Dependencies (Future)

The plugin has **no current external backend dependencies**. The `module.ts` registers only with `agentExtensionPoint`, `triggerExtensionPoint`, and `workflowRunnerExtensionPoint`. Future milestones will add `scaffolderServiceRef` for template schema resolution and `CatalogClient` for entity validation.

---

## Installation & Setup

### Backend Setup

#### 1. Add the backend module dependency

In `packages/backend/package.json`:

```json
"dependencies": {
  "@ai-crew-suite/plugin-agent-scaffolder-prd-backend": "workspace:^"
}
```

#### 2. Wire the module into the backend

In `packages/backend/src/index.ts`:

```ts
import { scaffolderPrdModule } from '@ai-crew-suite/plugin-agent-scaffolder-prd-backend';

backend.add(scaffolderPrdModule);
```

#### 3. Configure `app-config.yaml`

The module **throws at boot** if `ai.agents.scaffolderPrd.templates.allowed` is empty:

```yaml
ai:
  agents:
    scaffolderPrd:
      model: scaffolder-prd
      templates:
        allowed:
          - template:default/react-app
          - template:default/node-service
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
  "@ai-crew-suite/plugin-agent-scaffolder-prd": "workspace:^"
}
```

#### 2. Mount the page

In `packages/app/src/App.tsx`:

```ts
import scaffolderPrdExtensions from '@ai-crew-suite/plugin-agent-scaffolder-prd/alpha';

const app = createApp({
  features: [scaffolderPrdExtensions],
});
```

The page is available at `/scaffolder-ai-prd`.

#### 3. Extend App test expectations

In `packages/app/src/App.test.tsx`, add `scaffolder-ai-prd` to the expected plugin list.

---

## Configuration Reference

### Full `app-config.yaml` Schema

```yaml
ai:
  agents:
    scaffolderPrd:
      # Required
      model: scaffolder-prd
      templates:
        allowed:                      # At least one valid template ref required
          - template:default/react-app
          - template:default/node-service

      # --- optional, with defaults ---

      maxPrdChars: 20000              # Max characters accepted for the PRD text
      maxStories: 8                   # Max story blueprints derived from PRD spans

      execute:
        enabled: false                # Task execution must be explicitly enabled (future)
```

### Template Allow-List

The `templates.allowed` array requires at least one entry starting with `template:`. The module **throws at boot** if the list is empty or contains invalid references. The current Engineer channel always selects `allowedTemplates[0]` with a hardcoded score of 1.0 — no template matching or scoring is performed.

### PRD Parsing

The `parsePrd()` function:
1. Validates the request payload (version 1, source manual, non-empty `prdText` within `maxPrdChars`)
2. Splits `prdText` by newlines into non-empty lines
3. Assigns each line a stable citation ID (`prd-1`, `prd-2`, ...)

The optional `title` field overrides the epic title; otherwise the first span's text (truncated to 120 characters) is used.

### Channel Synthesis

All three channels are pure `Promise.resolve()` calls with no external dependencies:

| Channel | Step node | Output | Derivation |
|---|---|---|---|
| **Product Manager** | `pm` | `EpicBlueprint` + `StoryBlueprint[]` | Epic: first span as title (capped 120 chars) + description (full text). Stories: spans 2..N up to `maxStories`, each with `story-N` ID |
| **Engineer** | `engineer` | `TemplateBlueprint` | `templateRef`: `allowedTemplates[0]`, `score`: 1.0, `parameters`: empty array |
| **Technical Writer** | `writer` | `DocumentationBlueprint` | Hardcoded `docs/architecture.md` with sections: Overview, Requirements, Open questions |

No LLM, no tool invocation, and no external service call occurs in any channel.

### Blueprint Merge & Hash

The `mergeBlueprint()` function:
1. Sorts stories by `story-N` ID
2. Collects all evidence IDs from every channel into a unified evidence array
3. Computes a SHA-256 hash of the core blueprint for content-integrity verification
4. Always sets `status: 'blueprint_only'` and `readiness: 'complete'`
5. Records a persistent limitation about approval, ticket creation, and task execution not being active

### RBAC & Permissions

- **Manual translation** — any Backstage user with access to the `scaffolder-ai-prd` plugin can submit a PRD for translation
- **Approval & execution** — future: gated on `execute.enabled` and human confirmation; the current implementation is blueprint-only

---

## Designing & Authoring Workflows (Agent Core)

### Agent Definition

The PRD translator agent is registered with:

```ts
// agent.ts
{
  id: 'scaffolder-ai-prd',
  modelRef: config.modelRef,
  workflowRef: 'scaffolder-prd',
  memory: 'none',
  systemPrompt: SCAFFOLDER_PRD_SYSTEM_PROMPT,
  toolIds: [
    'project.ticket.search',
    'project.ticket.get',
    'vcs.repository.read_file',
    'knowledge.retrieve',
  ],
  triggers: [
    { id: 'prd-translation-on-demand', source: 'manual' },
  ],
}
```

### Request Schema

```ts
type PrdRequest = {
  version: 1;
  source: 'manual';
  prdText: string;        // Raw PRD content, capped at maxPrdChars
  title?: string;          // Optional title overriding the first span
};
```

### Graph Nodes

The graph runs a parallel fan-out with a single-merge join:

| Node | Behaviour |
|---|---|
| **prd.parse** | Splits PRD text by newlines into `prd-N` spans, derives the title from the optional `title` field or the first span (truncated to 120 characters) |
| **pm** (parallel) | Creates an `EpicBlueprint` from the first span and `StoryBlueprint[]` from subsequent spans (capped at `maxStories`), each with `story-N` IDs and `prd-N` evidence citations |
| **engineer** (parallel) | Creates a `TemplateBlueprint` selecting `allowedTemplates[0]` with score 1.0 and empty parameters. No template schema resolution is performed |
| **writer** (parallel) | Creates a `DocumentationBlueprint` with a single hardcoded file (`docs/architecture.md`) and three sections (Overview, Requirements, Open questions) |
| **join.merge** | Merges all three channel outputs into a `DeliveryBlueprint`, sorts stories by ID, collects all evidence, computes a SHA-256 hash, and records the persistent limitation |

### The Blueprint Artifact

```ts
type DeliveryBlueprint = {
  title: string;
  blueprintHash: string;                    // SHA-256 of the core blueprint
  readiness: 'complete' | 'partial';       // Always 'complete' in current milestone
  epic?: EpicBlueprint;
  stories: StoryBlueprint[];
  template?: TemplateBlueprint;
  documentation?: DocumentationBlueprint;
  openQuestions: string[];                  // Always empty in current milestone
  limitations: string[];
  evidence: { id: string; source: 'prd'; summary: string }[];
  status: 'blueprint_only' | 'unparseable'; // Always 'blueprint_only'
};
```

### Prompts & Tools Management

The system prompt is registered but not invoked:

```
Derive only cited delivery items from the supplied PRD spans. Never invent scope,
template references, parameter fields, tickets, approvals, or task execution.
```

All four tools (`project.ticket.search`, `project.ticket.get`, `vcs.repository.read_file`, `knowledge.retrieve`) are registered in the allow-list but **none are invoked** by the current graph. They are reserved for future channel enrichment.

---

## User Guide & Interface Walkthrough

### Dashboard Overview

The frontend lives at `/scaffolder-ai-prd` and provides:

1. **PRD submission form** — a multiline text area for pasting the raw PRD content and a title field
2. **BlueprintPanel** — renders the three-channel output after translation:
   - **Epic & Stories** — the derived epic with `prd-N` evidence citations and the story list
   - **Template** — the selected scaffolded template
   - **Documentation** — the documentation file/section outline

Runs are deep-linked via `?run=<id>`.

### Submitting a PRD

1. Navigate to `/scaffolder-ai-prd`
2. Paste raw PRD text into the text area (up to `maxPrdChars`, default 20000)
3. Optionally provide a title
4. Click **Translate**
5. The blueprint renders showing the epic, stories, template, and documentation outline

### Understanding the Blueprint

- **Epic** — the first paragraph of the PRD becomes the epic title and description
- **Stories** — each subsequent paragraph becomes a story with a `story-N` citation ID
- **Template** — always the first allow-listed template; no parameter coercion is performed
- **Documentation** — a suggested `docs/architecture.md` outline with three standard sections
- **Blueprint hash** — a SHA-256 hash of the blueprint for content-integrity verification
- **Limitations** — a persistent message noting that approval, ticket creation, task execution, catalog validation, and documentation publishing are not yet active

### Replaying a Translation

Append `?run=<id>` to the page URL to replay a persisted blueprint.

---

## Troubleshooting & FAQs

### Backend Configuration

**"Scaffolder PRD requires valid non-empty templates.allowed" at boot**

The `templates.allowed` array is empty or contains entries that don't start with `template:`. Add at least one valid template reference.

**"Request requires PRD text up to 20000 characters" error**

The PRD text exceeds `maxPrdChars`. Either shorten the PRD or raise the limit in config.

### Blueprint Output

**The template is always the first in my allow-list**

The current Engineer channel hardcodes `allowedTemplates[0]` with no template matching or scoring. Template selection is a structural placeholder — future milestones will add template matching based on PRD content.

**Template parameters are always empty**

The current Engineer channel outputs an empty `parameters` array. No template schema resolution or parameter coercion is performed. Future milestones will resolve the template's JSON schema and derive parameters from PRD content.

**Every blueprint shows "blueprint_only" status**

This is the persistent limitation for the current milestone. The blueprint is a read-only artifact — approval, ticket creation, task execution, and all write operations are deferred.

**The documentation outline never changes**

The Writer channel hardcodes a single file (`docs/architecture.md`) with three standard sections. No PRD content analysis drives the documentation outline. Future milestones will add content-aware documentation generation.

**Open questions are always empty**

The `openQuestions` array is always empty in the current milestone. Future milestones will derive open questions from ambiguities in the PRD text.

### Frontend

**Page loads but form does nothing**

Ensure `playwright/.auth/login.json` exists.

---

## Roadmap

The following features are planned for future releases.

### AI-Powered Channel Synthesis

The `modelRef`, `systemPrompt`, and all four registered tools are unused in the current implementation. When the LLM integration and tool drivers are available:

- The PM channel will invoke the model to derive a complete epic/story hierarchy with acceptance criteria, priorities, and estimates — not just span-wrapping
- The Engineer channel will match PRD content against template schemas, coerce parameters from PRD values, and validate against catalog constraints
- The Writer channel will generate content-aware documentation outlines based on the PRD's technical scope
- Each channel's model call will be constrained to cite specific `prd-N` spans for every claim
- `project.ticket.search` will check for duplicate epics; `vcs.repository.read_file` will read existing documentation; `knowledge.retrieve` will provide context from prior PRDs

### Template Schema Resolution & Parameter Coercion

The Engineer channel currently selects `allowedTemplates[0]` with empty parameters. When `scaffolderServiceRef` is integrated:

- The selected template's real `TemplateParameterSchema` will be resolved via `getTemplateParameterSchema()`
- PRD content will be analyzed for parameter values (service name, environment, capacity, region)
- The `coerceParameters()` pattern from `scaffolder-ai-intent` will fill schema-declared fields

### Approval Gate & Multi-Write Transactional Commit

The `execute.enabled` config flag and `blueprintHash` are in place. When the approval gate is implemented:

- The graph will emit an `approval_request` SSE event and checkpoint the blueprint after `join.merge`
- After a human `approved` decision, the graph will execute the delivery in dependency order:
  1. Create the epic via `project.ticket.create`
  2. Create stories as children of the epic
  3. Trigger the Scaffolder task via `scaffolderServiceRef.scaffold()`
- Partial-failure recording: if a later write fails, already-created items are reported precisely (no rollback in v1)
- Per-target idempotency via `(blueprintHash, target)` key pairs

### Catalog & Duplicate Detection

When `CatalogClient` and `project.ticket.search` are integrated:

- Validate proposed service names against the Backstage catalog to prevent component-name collisions
- Check for existing Jira epics with similar titles to prevent duplicate ticket creation
- Surface duplicate detections as `openQuestions` in the blueprint

### Content-Aware Documentation Generation

The Writer channel will analyze PRD content to derive documentation sections specific to the project scope — architecture diagrams for backend services, API specifications for frontend services, deployment runbooks — rather than the current hardcoded three-section outline.

### Playwright E2E Test Suite

- Controlled fixture data for PRD text and configured templates
- Playwright scenarios covering full happy-path translation, blueprint rendering with three-channel output, and replay recovery
- Screenshot review of the blueprint panel with epic/story tree, template panel, and documentation outline
