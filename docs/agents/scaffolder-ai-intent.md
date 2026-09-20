---
layout: default
title: Scaffolder AI Intent
parent: Scaffolder
plugin_name: plugin-ai-agent-backend-scaffolder-ai-intent
subcategory: Automation
---

# Scaffolder AI Intent

{: .no_toc }

<span class="label label-blue">{{ page.subcategory }}</span>

---

## Summary

The Scaffolder AI Intent plugin turns a plain-English provisioning request into a **validated Scaffolder template selection with pre-filled parameters**. A developer describes what they need in natural language — "create a react app called payment-gateway" — and the plugin extracts the service kind and proposed name through deterministic regex parsing, ranks configured allow-listed templates by token overlap, coerces the extracted facts against the selected template's real JSON schema (pulling defaults for every declared field), and checks catalog component-name availability. The result is a `ScaffolderIntentProposal` artifact showing the selected template, schema-declared parameters with their origin (`utterance` or `default`), any blocking validation issues (name collision or missing required fields) with targeted correction questions, and an `awaiting_correction` or `proposed` status.

Every decision in the pipeline is **pure code**: utterance parsing, template selection, parameter coercion, and name-availability checking are all deterministic functions. **No LLM is invoked** — the model reference and system prompt in the agent definition are reserved for future natural-language-powered extraction and correction turns.

## Key Features

- **Deterministic utterance parsing** — regex extraction of kind (`react`, `node`, `library`, `service`, `app`) and proposed name (`called|named <name>`) from natural language, bounded to `maxUtteranceChars` (default 1000)
- **Token-overlap template selection** — ranks configured allow-listed templates by substring overlap with the extracted kind and name; multiple matches score 1.0, first-position templates without content overlap score 0.4
- **Schema-grounded parameter coercion** — flattens the selected template's JSON schema across all steps, fills every field whose name contains "name" with the proposed name, fills every other field with its schema default, and flags required fields with no value as `missing_field` blocking issues
- **Catalog name-availability check** — queries the Backstage catalog via `CatalogClient.getEntityByRef()` for name collisions; a `name_taken` result is a blocking issue with a targeted correction question
- **Four proposal statuses** — `proposed` (no blocking issues), `awaiting_correction` (blocking issues exist with targeted questions), `no_template_match` (no template scored above `minSelectionScore`), `unparseable` (no kind extracted from the utterance)
- **Explicit milestone limitation** — the current implementation is proposal-only; correction turns, confirmation gates, and task execution are recorded as a limitation and deferred to future milestones

## Architecture

The plugin follows the standard two-package Backstage agent layout:

- **Backend module** (`@ai-crew-suite/plugin-agent-scaffolder-intent-backend`, `role: backend-plugin-module`, `pluginId: ai-core`) — registers the `IntentGraph` workflow runner (ID `scaffolder-intent`) with a `TemplateResolver` backed by the real `scaffolderServiceRef` and a `NameAvailabilityChecker` backed by `CatalogClient`; the agent definition has 4 read-only tools and a single manual trigger
- **Frontend plugin** (`@ai-crew-suite/plugin-agent-scaffolder-intent`, `role: frontend-plugin`, `pluginId: scaffoldinger-ai-intent`) — provides a standalone page at `/scaffolder-ai-intent` with an `IntentInputForm` for natural-language input and an `IntentProposalPanel` showing template candidates, parameters, and validation issues

The graph runs four deterministic nodes: `select` (template ranking against the allow-list) → `coerce` (schema-flattening and parameter filling) → `validate` (catalog name-availability check) → `proposal` (artifact emission). The artifact kind is `template-intent-proposal`.

---

## Getting Started & Prerequisites

### Backstage Version

- Requires a Backstage backend running the `ai-core` plugin, the Scaffolder backend (`@backstage/plugin-scaffolder-backend`), and the catalog backend (`@backstage/plugin-catalog-backend`)
- The module imports `scaffolderServiceRef` from `@backstage/plugin-scaffolder-node` and `CatalogClient` from `@backstage/catalog-client`

### Agentic Requirements

| Capability | Module | State |
|---|---|---|
| LLM routing & model registry | `plugin-ai-core-backend-module-llm-openai` or `llm-openrouter` | Required for agent registration; model not currently invoked — all extraction, selection, and coercion is deterministic |
| Scaffolder template service | `@backstage/plugin-scaffolder-backend` — `scaffolderServiceRef.getTemplateParameterSchema()` | Required; fetches the real JSON schema for each allow-listed template to coerce parameters |
| Catalog entity resolution | `@backstage/plugin-catalog-backend` — `CatalogClient.getEntityByRef()` | Required for name-availability check; missing catalog backend means `checkCatalogName` must be disabled |
| VCS (future) | `plugin-ai-core-backend-module-vcs` — `vcs.repository.get_metadata` | Listed in tool allow-list but not yet invoked; reserved for future repo-name validation |
| Compliance (future) | `plugin-ai-core-backend-module-compliance` — `compliance.policy.evaluate`, `compliance.architecture.validate` | Listed in tool allow-list but not yet invoked; reserved for policy checks |
| RAG (future) | `plugin-ai-core-backend-module-retrieval-augmenter` | Listed in tool allow-list but not yet invoked; reserved for template documentation enrichment |
| Runtime store | `plugin-ai-core-backend-module-runtime-store` | Required for run/artifact persistence |

---

## Installation & Setup

### Backend Setup

#### 1. Add the backend module dependency

In `packages/backend/package.json`:

```json
"dependencies": {
  "@ai-crew-suite/plugin-agent-scaffolder-intent-backend": "workspace:^"
}
```

#### 2. Wire the module into the backend

In `packages/backend/src/index.ts`:

```ts
import { scaffolderIntentModule } from '@ai-crew-suite/plugin-agent-scaffolder-intent-backend';

backend.add(scaffolderIntentModule);
```

#### 3. Configure `app-config.yaml`

The module **throws at boot** if `ai.agents.scaffolderIntent.templates.allowed` is empty or contains invalid template references:

```yaml
ai:
  agents:
    scaffolderIntent:
      model: scaffolder-intent
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
  "@ai-crew-suite/plugin-agent-scaffolder-intent": "workspace:^"
}
```

#### 2. Mount the page

In `packages/app/src/App.tsx`:

```ts
import scaffolderIntentExtensions from '@ai-crew-suite/plugin-agent-scaffolder-intent/alpha';

const app = createApp({
  features: [scaffolderIntentExtensions],
});
```

The page is available at `/scaffolder-ai-intent`.

#### 3. Extend App test expectations

In `packages/app/src/App.test.tsx`, add `scaffolder-ai-intent` to the expected plugin list.

---

## Configuration Reference

### Full `app-config.yaml` Schema

```yaml
ai:
  agents:
    scaffolderIntent:
      # Required
      model: scaffolder-intent
      templates:
        allowed:                      # At least one valid template ref required
          - template:default/react-app
          - template:default/node-service

      # --- optional, with defaults ---

      maxUtteranceChars: 1000         # Max characters accepted in the utterance
      minSelectionScore: 0.35         # Minimum score for a candidate to be selected

      validation:
        checkCatalogName: true        # Check Backstage catalog for component name collisions

      execute:
        enabled: false                # Task execution must be explicitly enabled (future)
```

### Template Allow-List

The `templates.allowed` array requires at least one entry matching the pattern `template:<namespace>/<name>` (e.g., `template:default/react-app`). The module **throws at boot** if the list is empty or contains invalid references. Templates not in this list can never be selected by an utterance.

### Utterance Parsing

The `parseIntentQuery()` function extracts two facts from the utterance:

| Fact | Pattern | Example |
|---|---|---|
| `proposedName` | `/called|named ([a-z0-9-]+)/i` | "create a react app called **payment-gateway**" → `payment-gateway` |
| `kind` | `/react|node|library|service|app/i` | "create a **react** app" → `react` |

The utterance is capped at `maxUtteranceChars` (default 1000). Only `source: manual` and `version: 1` are accepted.

### Template Selection Scoring

The `selectTemplates()` function scores each allow-listed template:

| Condition | Score |
|---|---|
| Any template token matches the extracted kind or proposed name | 1.0 |
| First-position template with no token overlap | 0.4 |
| Other templates with no token overlap | 0.0 |

Candidates with no kind extracted produce `unparseable` status. The top candidate must have a score >= `minSelectionScore` (default 0.35) — below this, the status is `no_template_match`.

### Parameter Coercion

The `coerceParameters()` function:
1. Flattens all steps in the template's `TemplateParameterSchema` into a single field list
2. For each field whose name contains "name" → fills with `proposedName` (origin: `utterance`)
3. For all other fields → fills with the schema's `default` value (origin: `default`)
4. Fields that are `required` in the schema but have no value → flagged as `missing_field` blocking issue with a targeted question

### RBAC & Permissions

- **Manual proposal** — any Backstage user with access to the `scaffolder-ai-intent` plugin can submit a natural-language request
- **Task execution** — future: gated on `execute.enabled` and human confirmation; the current implementation is proposal-only

---

## Designing & Authoring Workflows (Agent Core)

### Agent Definition

The intent agent is registered with:

```ts
// agent.ts
{
  id: 'scaffolder-ai-intent',
  modelRef: config.modelRef,
  workflowRef: 'scaffolder-intent',
  memory: 'session',
  systemPrompt: SCAFFOLDER_INTENT_SYSTEM_PROMPT,
  toolIds: [
    'vcs.repository.get_metadata',
    'compliance.policy.evaluate',
    'compliance.architecture.validate',
    'knowledge.retrieve',
  ],
  triggers: [
    { id: 'intent-request-on-demand', source: 'manual' },
  ],
}
```

### Request Schema

```ts
type IntentRequest = {
  version: 1;
  source: 'manual';
  utterance: string;     // Natural-language provisioning request
};
```

### Graph Nodes

The graph runs a four-node pipeline. **No LLM is invoked at any step:**

| Node | Source | Behaviour |
|---|---|---|
| **select** | `select.ts` | Computes token overlap between the extracted kind/name and each allow-listed template's ref tokens. Scores the top candidate. Terminal: `unparseable` (no kind extracted) or `no_template_match` (no candidate above `minSelectionScore`) |
| **coerce** | `coerce.ts` | Calls `TemplateResolver.resolve()` to fetch the selected template's `TemplateParameterSchema` from the real `scaffolderServiceRef`, flattens all step fields, fills name-containing fields with `proposedName` and others with schema defaults, and flags required-but-empty fields as `missing_field` blocking issues |
| **validate** | `IntentGraph.ts` | If `checkCatalogName` is enabled and a name field exists, calls `NameAvailabilityChecker.isAvailable()` (backed by `CatalogClient.getEntityByRef()`), pushing a `name_taken` blocking issue with a targeted correction question on collision |
| **proposal** | `IntentGraph.ts` | Assembles the `ScaffolderIntentProposal` artifact: status is `awaiting_correction` if any blocking issues exist, `proposed` otherwise. A persistent limitation records that correction turns, confirmation, and task execution are not active |

### The Template Resolver

The `TemplateResolver` class wraps the real `scaffolderServiceRef`:

```ts
class TemplateResolver {
  constructor(scaffolder, credentials, allowedTemplates) {...}

  async resolve(templateRef: string): Promise<TemplateParameterSchema | undefined> {
    // Returns the real Backstage Scaffolder JSON schema for a template
    // Returns undefined if the template is not in the allow-list
  }
}
```

Templates not in the configured `templates.allowed` list are rejected even if they exist in the Scaffolder backend — this prevents utterances from selecting unapproved templates.

### The Name Availability Checker

The `NameAvailabilityChecker` wraps `CatalogClient`:

```ts
class NameAvailabilityChecker {
  async isAvailable(name: string): Promise<boolean> {
    // Checks catalog for an entity with the proposed name
    // Returns false if a collision exists
  }
}
```

The check can be disabled via `validation.checkCatalogName: false` for installations without a catalog backend.

### The Proposal Artifact

```ts
type ScaffolderIntentProposal = {
  utterance: string;
  sessionId: string;
  status: 'proposed' | 'awaiting_correction' | 'no_template_match' | 'unparseable';
  selectedTemplate?: string;
  candidates: TemplateCandidate[];           // All ranked allow-listed templates
  confidence: 'high' | 'low';
  parameters: ParameterProposal[];           // Schema-declared fields with origin
  issues: ValidationIssue[];                 // Blocking name_taken or missing_field
  turns: number;                             // Always 0 in current milestone
  limitations: string[];
  evidence: { id: string; source: 'template' | 'catalog'; summary: string; reference?: string }[];
};
```

### Deterministic Engines

All three pipeline engines are pure functions with no model dependency:

**`parseIntentQuery()`** (pure): Regex-based extraction of `proposedName` and `kind` from the utterance. Rejects malformed, oversized, or unsourced requests.

**`selectTemplates()`** (pure): Maps each allowed template to a score based on token overlap. No model, no schema call — works entirely from the configured allow-list strings.

**`coerceParameters()`** (pure): Flattens the real template schema, maps name fields to the proposed name, applies defaults, and flags missing required fields. The `TemplateResolver` does call `scaffolderServiceRef.getTemplateParameterSchema()` (an async service call), but the coercion logic itself is deterministic.

### Prompts & Tools Management

The system prompt is registered with the agent but not invoked:

```
Use only configured templates and schema-declared fields. Never invent a template,
parameter, catalog availability result, confirmation, or task execution.
```

All four tools (`vcs.repository.get_metadata`, `compliance.policy.evaluate`, `compliance.architecture.validate`, `knowledge.retrieve`) are registered in the allow-list but **none are invoked by the current graph**. They are reserved for future validation enrichment.

---

## User Guide & Interface Walkthrough

### Dashboard Overview

The frontend lives at `/scaffolder-ai-intent` and provides:

1. **IntentInputForm** — a text input for entering a natural-language provisioning request
2. **IntentProposalPanel** — renders the proposal with template candidates, resolved parameters, and validation issues

Runs are deep-linked via `?run=<id>` for replay.

### Submitting a Request

1. Navigate to `/scaffolder-ai-intent`
2. Type a natural-language request, e.g., "create a react app called payment-gateway"
3. Click **Submit**
4. The proposal renders showing:
   - **Selected template** — the top-ranked allow-listed template (e.g., `template:default/react-app`)
   - **Template candidates** — all scored candidates with token overlap details
   - **Parameters** — every schema-declared field with its filled value and origin (`utterance` or `default`)
   - **Validation issues** — any blocking issues with targeted correction questions

### Understanding the Proposal

- **`proposed`** — all required fields are filled, catalog name check passed. The parameters are ready for confirmation (future milestone).
- **`awaiting_correction`** — at least one blocking issue exists. The issue's `question` field provides a targeted prompt for the correction turn (e.g., "payment-gateway is already taken — what name should I use instead?").
- **`no_template_match`** — no allow-listed template scored above `minSelectionScore` for the extracted kind. Try a more specific utterance or add more templates to the allow-list.
- **`unparseable`** — no kind could be extracted from the utterance. Try using one of the recognized kind words: `react`, `node`, `library`, `service`, or `app`.

### Replaying a Proposal

Append `?run=<id>` to the page URL to replay a persisted proposal.

---

## Troubleshooting & FAQs

### Backend Configuration

**"Scaffolder intent requires valid non-empty templates.allowed" at boot**

The `templates.allowed` array is empty or contains entries that don't match the pattern `template:<namespace>/<name>`. Add at least one valid template reference.

**"Selected template is not allow-listed" error**

The `selectTemplates()` function chose a template, but `TemplateResolver` could not fetch its schema because it wasn't in the allow-list. This is a consistency error — ensure the top-scored candidate is actually in the allow-list.

### Utterance Parsing

**"create a python app called my-service" produces `unparseable`**

The recognized kind words are `react`, `node`, `library`, `service`, and `app` only. `python` is not recognized. Use a recognized kind or add custom kind extraction to `parseIntentQuery()`.

**"create a service called" with no name produces `no_template_match`**

The name extraction requires the word `called` or `named` followed by a lowercase alphanumeric-hyphen identifier. If the name is omitted or contains forbidden characters, `proposedName` will be `undefined`, reducing template selection to kind-only matching.

**All requests score 0.4 for the first template**

When no template tokens overlap with the extracted kind or name, the first template in the allow-list receives a 0.4 score. This is above the `minSelectionScore` default of 0.35, so it will be selected. To require stronger matching, raise `minSelectionScore` above 0.4.

### Parameter Coercion

**A required field is always `missing_field`**

The coercer fills only name-containing fields from the utterance and all others from schema defaults. If a required field has no `default` in the schema, it will always produce a `missing_field` blocking issue. Add defaults to the template schema or configure the field as optional.

**A non-name field got the proposed name value**

The coercer checks `field.toLowerCase().includes('name')` — any field whose name contains the substring "name" (e.g., `username`, `namespace`, `domainName`) will receive the proposed name. This is intentional but may surprise if the template has non-component-name name fields.

### Catalog Name Check

**Every proposal shows `name_taken` for a component that doesn't exist**

The `NameAvailabilityChecker` queries the catalog for `component:default/<name>` as the entity ref. If your organization uses a different namespace, the check will report a false collision. Customize the entity ref format in `NameAvailabilityChecker`.

### Frontend

**Page loads but form does nothing**

Ensure `playwright/.auth/login.json` exists.

**Proposal panel shows "correction turns and task execution are not active"**

This is the persistent limitation for the current proposal-only milestone. This message always appears and does not indicate an error.

---

## Roadmap

The following features are planned for future releases.

### AI-Powered Utterance Parsing & Intent Extraction

The current `parseIntentQuery()` uses regex to extract only `kind` and `proposedName` from utterances. The `modelRef` and `systemPrompt` are reserved for a future model call that will parse richer provisioning requests — extracting multiple parameters, understanding constraints ("a small database in eu-west-1 with 2GB storage"), and mapping natural-language values to schema field names.

### Self-Healing Correction Loop

The `session` memory mode and `turns` field in the proposal are placeholders. When implemented:

- A proposal with `awaiting_correction` status will present the blocking issue's `question` field to the user
- The user will respond with a corrected value, creating a new turn within the same session
- The graph will re-enter at the `coerce` step with the corrected value, re-validate, and produce an updated proposal
- Correction turns will be bounded to prevent infinite loops

### Confirmation Gate & Task Execution

The `execute.enabled` config flag and `scaffolderServiceRef` dependency are in place but task execution is gated on the confirmation gate. When implemented:

- A `proposed` status will emit an `approval_request` SSE event and checkpoint the parameters
- The user will confirm or reject the proposal via the frontend
- On confirm, the graph will call `scaffolderServiceRef.scaffold()` with the real template ref and coerced parameters
- A `template-intent-execution` artifact will record the spawned Scaffolder task ID

### VCS Repository Validation

The `vcs.repository.get_metadata` tool is registered but not invoked. When enabled:

- Validate proposed component names against existing repository names to prevent VCS name collisions
- Additional validation beyond catalog name availability

### Compliance & Policy Validation

The `compliance.policy.evaluate` and `compliance.architecture.validate` tools are registered but not invoked. When enabled:

- Validate the selected template and parameters against organizational compliance policies before proceeding to confirmation
- Reject templates that would provision resources exceeding allowed capacity or region boundaries

### Expanded Kind Recognition

The current kind extractor recognizes only 5 words (`react`, `node`, `library`, `service`, `app`). Extending the pattern to support additional technology stacks and service types — or replacing the regex extractor with model-powered intent classification — will broaden the quality of template selection.

### Playwright E2E Test Suite

- Controlled fixture data for Scaffolder templates and catalog entities
- Playwright scenarios covering full happy-path proposal, name collision with `awaiting_correction`, `no_template_match`, `unparseable`, and replay recovery
