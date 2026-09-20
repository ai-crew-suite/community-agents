---
layout: default
title: Scaffolder AI Infra Generator
parent: Scaffolder
plugin_name: plugin-ai-agent-backend-scaffolder-ai-infra
subcategory: Infrastructure
---

# Scaffolder AI Infra Generator

{: .no_toc }

<span class="label label-blue">{{ page.subcategory }}</span>

---

## Summary

The Scaffolder AI Infra Generator produces Infrastructure-as-Code files from approved organizational blueprints, operating through **two delivery channels**: an AI Core preview runner that generates and validates files in-memory for review (with persisted, replayable reports), and a **Scaffolder action** (`ai:infra:generate`) that writes validated files into the live Scaffolder workspace during a template run. Both channels share the same deterministic pipeline: parse the request, load the approved blueprint by provider and ID, route to a provider-specific dialect (Terraform → HCL via `main.tf`, CloudFormation → YAML via `template.yaml`), fill only explicit `{{key}}` holes with validated request values, and validate the output against three blocking security checks.

Generation is **entirely deterministic and model-free**: `renderBlueprint()` in `generate.ts` is a pure string substitution function — `{{serviceName}}`, `{{region}}`, `{{cpu}}`, and other values from the validated request replace matching placeholder holes in the blueprint. No LLM is invoked, no resources are invented, and no module sources or provider values are added that weren't already in the approved blueprint. The Scaffolder action additionally enforces sandboxed workspace writes with path-traversal protection and optional overwrite controls.

## Key Features

- **Dual delivery**: AI Core preview runner (`scaffolder-infra`) for in-memory generation and report replay, plus a Scaffolder action (`ai:infra:generate`) for workspace writes during template runs
- **Deterministic blueprint fill** — `{{key}}` holes are replaced with validated request values; unrecognized keys remain as `{{key}}` (producing a blocking validation finding)
- **Provider routing** — `terraform` → `terraform-expert` role / HCL / `main.tf`; `cloudformation` → `cloudformation-expert` role / YAML / `template.yaml`
- **Three-layer validation**: syntax (unresolved `{{key}}` holes), security (embedded secrets, passwords, API keys), and public-exposure (wildcard IAM / `0.0.0.0/0` ingress) — all three are `blocking` severity
- **Request intake validation** — provider and service name format, capacity ceilings (`maxCpu`/`maxMemoryMb`/`maxStorageGb`), and allowed-region enforcement
- **Sandboxed workspace writes** — the action resolves all output paths against the workspace root, rejects traversal attempts, and optionally refuses overwrites of existing files
- **Dry-run support** — the Scaffolder action supports `ctx.isDryRun`, returning file paths without writing
- **Config-required blueprints** — at least one approved `terraform` or `cloudformation` blueprint source must be configured; unrecognized providers are rejected at boot

## Architecture

This plugin is unique in the series — it registers **two backend modules**:

- **AI Core module** (`scaffolderInfraModule`, `pluginId: ai-core`, `moduleId: agent-scaffolder-ai-infra`) — registers the `InfraGraph` preview runner (ID `scaffolder-infra`) with `BlueprintResolver` backed by `urlReader`, and the `scaffolder-ai-infra` agent with 3 tools and a single manual trigger
- **Scaffolder action module** (`scaffolderInfraActionModule`, `pluginId: scaffolder`, `moduleId: ai-infra-action`) — registers the `ai:infra:generate` custom action on `scaffolderActionsExtensionPoint`

Both modules share the same config (`ai.agents.scaffolderInfra`), the same `BlueprintResolver`, the same `generatePreview()` pipeline, and the same request parsing and validation. The only difference: the AI Core runner emits an `infra-generation-report` artifact, while the Scaffolder action writes files to the workspace and outputs `ctx.output('files', ...)` and `ctx.output('report', ...)`.

The frontend provides a standalone preview page at `/scaffolder-ai-infra` with a generation dialog, generated file list, findings panel, correction timeline, and status banner.

---

## Getting Started & Prerequisites

### Backstage Version

- Requires a Backstage backend running the `ai-core` plugin and the Scaffolder plugin (`@backstage/plugin-scaffolder-backend`)
- The Scaffolder action module requires `scaffolderActionsExtensionPoint` from `@backstage/plugin-scaffolder-node`

### Agentic Requirements

| Capability | Module | State |
|---|---|---|
| LLM routing & model registry | `plugin-ai-core-backend-module-llm-openai` or `llm-openrouter` | Required for agent registration; model not currently invoked — all generation is deterministic |
| VCS repository read | `plugin-ai-core-backend-module-vcs` — `vcs.repository.read_file` | Listed in tool allow-list but not yet invoked; reserved for future blueprint content reads from repositories |
| Compliance policy | `plugin-ai-core-backend-module-compliance` — `compliance.policy.evaluate` | Listed in tool allow-list but not yet invoked; reserved for future policy validation against generated files |
| Compliance architecture | `plugin-ai-core-backend-module-compliance` — `compliance.architecture.validate` | Listed in tool allow-list but not yet invoked; reserved for future architecture constraint checks |
| Blueprint source URLs | `coreServices.urlReader` (Backstage core) | Required; fetches approved blueprint content from configured URLs |
| Runtime store | `plugin-ai-core-backend-module-runtime-store` | Required for preview run/artifact persistence |

---

## Installation & Setup

### Backend Setup — AI Core Preview Runner

#### 1. Add the backend package dependency

In `packages/backend/package.json`:

```json
"dependencies": {
  "@ai-crew-suite/plugin-agent-scaffolder-infra-backend": "workspace:^"
}
```

#### 2. Wire the AI Core module

In `packages/backend/src/index.ts`:

```ts
import { scaffolderInfraModule } from '@ai-crew-suite/plugin-agent-scaffolder-infra-backend';
backend.add(scaffolderInfraModule);
```

### Backend Setup — Scaffolder Action

#### 3. Wire the Scaffolder action module

In the same `packages/backend/src/index.ts`, add the action module **after** the Scaffolder backend:

```ts
import { scaffolderInfraActionModule } from '@ai-crew-suite/plugin-agent-scaffolder-infra-backend';
backend.add(scaffolderInfraActionModule);
```

This registers the `ai:infra:generate` action available to all Scaffolder templates.

#### 4. Configure `app-config.yaml`

The module **throws at boot** if `ai.agents.scaffolderInfra.model` is missing or if no approved blueprint sources are configured:

```yaml
ai:
  agents:
    scaffolderInfra:
      model: scaffolder-infra
      blueprints:
        sources:
          - id: standard-database
            provider: terraform
            url: https://blueprints.example.com/db.tf
          - id: standard-microservice
            provider: cloudformation
            url: https://blueprints.example.com/microservice.yaml
```

See [Configuration Reference](#configuration-reference) for the full schema.

### Frontend Setup

#### 1. Add the frontend plugin dependency

In `packages/app/package.json`:

```json
"dependencies": {
  "@ai-crew-suite/plugin-agent-scaffolder-infra": "workspace:^"
}
```

#### 2. Mount the page

In `packages/app/src/App.tsx`:

```ts
import scaffolderInfraExtensions from '@ai-crew-suite/plugin-agent-scaffolder-infra/alpha';

const app = createApp({
  features: [scaffolderInfraExtensions],
});
```

The preview page is available at `/scaffolder-ai-infra`.

#### 3. Extend App test expectations

In `packages/app/src/App.test.tsx`, add `scaffolder-ai-infra` to the expected plugin list.

---

## Configuration Reference

### Full `app-config.yaml` Schema

```yaml
ai:
  agents:
    scaffolderInfra:
      # Required
      model: scaffolder-infra
      blueprints:
        sources:
          - id: standard-database
            provider: terraform          # terraform or cloudformation
            url: https://blueprints.example.com/db.tf

      # --- optional, with defaults ---

      maxBlueprintBytes: 65536           # Max blueprint size fetched from URL
      maxGeneratedBytes: 131072          # Max total generated content across all files
      maxFiles: 8                        # Max generated files per run
      maxToolInvocations: 10             # Hard cap on tool invocations (preview runner)
      maxCorrectionRounds: 2             # Future self-correction limit (unused in v1)
      allowOverwrite: false              # Allow Scaffolder action to overwrite existing workspace files

      # Capacity limits enforced at request intake
      capacity:
        maxCpu: 8
        maxMemoryMb: 16384               # ~16 GB
        maxStorageGb: 512

      # Allowed provider regions (empty = all allowed)
      allowedRegions:
        - us-east-1
        - eu-west-1
```

### Blueprint Sources

Each source in `blueprints.sources` must have:
- `id` — a unique identifier matched against `request.blueprintId`; if no blueprintId is specified in the request, the first source matching the requested provider is used
- `provider` — `terraform` or `cloudformation`; rejected at boot if any other value appears
- `url` — a URL resolvable by Backstage's `urlReader` service (supports `http://`, `https://`, and relative paths)

Blueprint content is fetched at generation time and cached only for the duration of the run.

### Request Validation Rules

| Field | Rule | Error |
|---|---|---|
| `provider` | Must be `terraform` or `cloudformation` | `Request field 'provider' must be terraform or cloudformation` |
| `serviceName` | Must match `/^[a-z0-9-]+$/` | `serviceName must use lowercase letters, numbers, and hyphens` |
| `capacity.cpu` | Must not exceed `maxCpu` | `Requested capacity exceeds configured maxima` |
| `capacity.memoryMb` | Must not exceed `maxMemoryMb` | (same) |
| `capacity.storageGb` | Must not exceed `maxStorageGb` | (same) |
| `region` | Must be in `allowedRegions` (or unset) | `Region 'X' is not allowed` |

Capacity and region validation apply to both the AI Core preview runner and the Scaffolder action — invalid requests are rejected before any blueprint is loaded.

### RBAC & Permissions

- **Preview generation** — any Backstage user with access to the `scaffolder-ai-infra` plugin can submit a preview via the AI Core route
- **Scaffolder action** — invoked within a Scaffolder template run; authorization is governed by the Scaffolder template's own permission model
- **No approval gate or write controls** exist on the preview runner; the Scaffolder action writes only within its sandboxed workspace

---

## Designing & Authoring Workflows (Agent Core)

### Agent Definition

The infra preview agent is registered with:

```ts
// agent.ts
{
  id: 'scaffolder-ai-infra',
  modelRef: config.modelRef,
  workflowRef: 'scaffolder-infra',
  memory: 'none',
  systemPrompt: SCAFFOLDER_INFRA_SYSTEM_PROMPT,
  toolIds: [
    'vcs.repository.read_file',
    'compliance.policy.evaluate',
    'compliance.architecture.validate',
  ],
  triggers: [
    { id: 'infra-generate-on-demand', source: 'manual' },
  ],
}
```

### Request Schema

```ts
type InfraGenerationRequest = {
  version: 1;
  source: 'action' | 'manual';
  provider: 'terraform' | 'cloudformation';
  serviceName: string;              // Lowercase alphanumeric + hyphens
  entityRef?: string;
  environment?: string;
  capacity?: { cpu?: number; memoryMb?: number; storageGb?: number; instanceType?: string };
  region?: string;                  // Must be in allowedRegions if set
  blueprintId?: string;             // Matches a configured blueprint source ID
  outputDir?: string;               // Scaffolder-relative; only used by the action
};
```

### Pipeline

The pipeline is identical across both the AI Core preview runner and the Scaffolder action:

| Step | Source | Behaviour |
|---|---|---|
| **request intake** | `intake.ts` | Validates provider, serviceName format, capacity ceilings, and region allow-list. Throws `InfraRequestValidationError` on any violation |
| **blueprint.load** | `BlueprintResolver` | Matches the request's provider and optional `blueprintId` against configured sources, fetches the blueprint via `urlReader`, and returns the matched source + content. Terminal: `blueprint_unavailable` if no match or fetch fails |
| **route** | `route.ts` | Maps provider to dialect and output filename: `terraform` → `terraform-expert` / `hcl` / `main.tf`; `cloudformation` → `cloudformation-expert` / `yaml` / `template.yaml` |
| **generate** | `generate.ts` / `generation.ts` | Runs `renderBlueprint()` which does pure `{{key}}` → value string substitution across 7 keys (`serviceName`, `region`, `environment`, `cpu`, `memoryMb`, `storageGb`, `instanceType`). Unrecognized keys are left as `{{key}}` in the output |
| **validate** | `validate.ts` | Runs three regex-based checks: unresolved `{{key}}` holes (`blocking`), secret material (PEM blocks, password=, api_key=, secret=) (`blocking`), and public exposure (`0.0.0.0/0` or wildcard IAM) (`blocking`). Any blocking finding → `validation_failed` |

After validation, the AI Core runner emits an `infra-generation-report` artifact with status `generated` or `validation_failed`. The Scaffolder action writes validated files to the workspace (or throws on `validation_failed`).

### The Blueprint Render Engine

`renderBlueprint()` is the only "generation" step — and it is a pure string substitution:

```ts
const replacements = {
  serviceName: request.serviceName,
  region: request.region ?? '',
  environment: request.environment ?? '',
  cpu: String(request.capacity?.cpu ?? ''),
  memoryMb: String(request.capacity?.memoryMb ?? ''),
  storageGb: String(request.capacity?.storageGb ?? ''),
  instanceType: request.capacity?.instanceType ?? '',
};

const content = blueprint.replace(/\\{\\{([a-zA-Z0-9]+)\\}\}/g, (_, key) =>
  replacements[key] ?? `{{${key}}}`
);
```

**Important**: Unrecognized `{{key}}` values are **left as-is** in the output (e.g., `{{teamTag}}` stays as `{{teamTag}}`), which will trigger a `blocking` validation finding for unresolved placeholder holes. This ensures no blueprint hole is silently dropped.

### Validation Checks

| Pattern | Severity | Source |
|---|---|---|
| `\\{\\{[^}]+\\}\\}` (unresolved holes) | `blocking` | `syntax` |
| PEM blocks, `password=`, `api_key=`, `secret=` | `blocking` | `security` |
| `0.0.0.0/0` or wildcard IAM actions | `blocking` | `security` |

### Scaffolder Action

The `ai:infra:generate` action reuses the same pipeline and adds workspace writes:

1. Parses the action input through `parseInfraQuery()`
2. Resolves the blueprint via `BlueprintResolver`
3. Calls `generatePreview()` for the in-memory generation + validation
4. **If `validation_failed`**: throws an error with all finding messages — no files are written
5. **If validated**: calls `writeWorkspaceFiles()` with path resolution, traversal protection, overwrite guard (`allowOverwrite`), and dry-run support
6. Outputs `ctx.output('files', files)` and `ctx.output('report', report)`

The action is wrapped in `ctx.checkpoint()` and supports `ctx.isDryRun`.

### Prompts & Tools Management

The system prompt and tool allow-list are registered but not invoked in the current implementation:

```
Fill only explicit approved blueprint holes with supplied validated values.
Never add resources, module sources, credentials, secrets, broad IAM, public ingress,
or provider values not present in the blueprint.
```

The `vcs.repository.read_file`, `compliance.policy.evaluate`, and `compliance.architecture.validate` tools are reserved for future blueprint content retrieval from repositories and policy-driven validation.

---

## User Guide & Interface Walkthrough

### Dashboard Overview

The frontend provides a preview-only page at `/scaffolder-ai-infra` with:

1. **Generate preview** button — opens `PreviewGenerationDialog`
2. **GeneratedFileList** — each generated file with path, byte size, and dialect
3. **FindingsPanel** — validation findings with severity badges and file references
4. **CorrectionTimeline** — placeholder for future self-correction rounds
5. **GenerationStatusBanner** — live status (`generated`, `validation_failed`, `blueprint_unavailable`)

### Using the Preview Runner

1. Navigate to `/scaffolder-ai-infra`
2. Click **Generate preview**
3. Fill in provider (`terraform` or `cloudformation`), service name, and optional capacity/region/blueprint ID
4. Click **Generate**
5. Review the generated file list, validation findings, and status

### Using the Scaffolder Action in Templates

In any Backstage Scaffolder template `template.yaml`, add the action step:

```yaml
steps:
  - id: generate-infra
    name: Generate Infrastructure
    action: ai:infra:generate
    input:
      provider: terraform
      serviceName: ${{ parameters.serviceName }}
      environment: ${{ parameters.environment }}
      capacity:
        cpu: ${{ parameters.cpu }}
        memoryMb: ${{ parameters.memoryMb }}
      region: us-east-1
      blueprintId: standard-database
      outputDir: infra
```

The action writes files into `${outputDir}/` within the workspace. On failure, the entire template step fails with a descriptive error.

### Interpreting the Report

- **`generated`** — all validations passed. Files are valid and ready for use (or already written to workspace in action mode)
- **`validation_failed`** — at least one blocking finding exists. In preview mode, examine the findings; in action mode, the step fails
- **`blueprint_unavailable`** — no configured blueprint source matched the provider and optional `blueprintId`

### Replaying a Preview

Append `?run=<id>` to the preview page URL to replay a persisted generation report.

---

## Troubleshooting & FAQs

### Backend Configuration

**"Scaffolder infra requires non-empty approved terraform/cloudformation blueprint sources" at boot**

At least one blueprint source must be configured with provider `terraform` or `cloudformation`. Add entries to `blueprints.sources` in `app-config.yaml`.

**"Requested capacity exceeds configured maxima" on every request**

The capacity fields (`cpu`, `memoryMb`, `storageGb`) must not exceed the configured maxima. Either reduce the requested capacity or raise the limits in `capacity.maxCpu` / `capacity.maxMemoryMb` / `capacity.maxStorageGb`.

**"Region is not allowed" when a region is specified**

The `allowedRegions` list is restrictive — if it's empty, all regions are rejected when a region is specified. Add the desired region to `allowedRegions`, or omit the region from requests entirely.

### Generation

**`blueprint_unavailable` on every run**

The `BlueprintResolver` matches by provider (required) and optional `blueprintId`. Verify that the request's provider matches at least one configured source, and that the `blueprintId` (if specified) matches a configured source's `id`.

**Generated file still has `{{key}}` placeholders**

The `renderBlueprint()` function only fills the 7 recognized keys: `serviceName`, `region`, `environment`, `cpu`, `memoryMb`, `storageGb`, `instanceType`. Any other `{{key}}` in the blueprint remains as-is and triggers a blocking validation finding. Add the missing key to the blueprint, or pre-fill it before the blueprint URL is configured.

**`validation_failed` with 'Blueprint contains unresolved placeholder holes'**

One or more `{{key}}` placeholders in the blueprint could not be filled. Check which keys are present in the blueprint content and ensure the corresponding request fields are populated.

**`validation_failed` with 'prohibited secret material'**

The generated output contains patterns matching PEM blocks, `password=`, `api_key=`, or `secret=`. The blueprint itself may contain credential-like placeholders. Replace them with `{{key}}` style placeholders that will be filled at generation time.

**`validation_failed` with 'public ingress or wildcard IAM'**

The generated output contains `0.0.0.0/0` or `"Action" : "*"` wildcard IAM patterns. Remove these from the blueprint or replace them with parameterized values.

### Scaffolder Action

**Action fails with 'No approved blueprint matches this provider'**

The Scaffolder action uses the same `BlueprintResolver` and config as the preview runner. Verify blueprint sources are configured and match the action's input.

**Action fails with 'Refusing to overwrite existing workspace file'**

Set `allowOverwrite: true` in config, or use `outputDir` to write to a different directory. The action will not overwrite existing files by default.

**Action fails with 'escapes the Scaffolder workspace'**

The `outputDir` or generated file paths resolve outside the Scaffolder workspace root. Use relative paths within the workspace.

---

## Roadmap

The following features are planned for future releases.

### AI-Powered Blueprint Generation

The `modelRef`, `systemPrompt`, and compliance tools are registered but not yet invoked. When the LLM integration and compliance drivers are available:

- The `renderBlueprint()` step will be replaced or augmented with a model call that understands the blueprint structure and can fill values contextually
- `compliance.policy.evaluate` and `compliance.architecture.validate` will run against the generated output for automated policy checks
- The model will be constrained by the system prompt to never add resources, module sources, or provider values not in the approved blueprint

### Self-Correction Loop

The `maxCorrectionRounds` config (default 2) and `CorrectionTimeline` frontend component are placeholders. When implemented:

- On `validation_failed`, the graph will feed findings back to the generation step for up to `maxCorrectionRounds` attempts
- Each round produces a correction entry in the timeline
- The loop terminates on success, after exhausting rounds, or if the same finding persists across consecutive rounds

### VCS Blueprint Source Retrieval

The `vcs.repository.read_file` tool is registered but not yet invoked. When enabled, blueprint sources can be configured as repository paths rather than requiring accessible HTTP URLs:

```yaml
blueprints:
  sources:
    - id: standard-database
      provider: terraform
      repoUrl: https://github.com/myorg/blueprints
      path: database/main.tf
```

### Catalog-Context Injection

The `entityRef` field is accepted in requests but not yet used. When `CatalogEntityResolver` is available:

- The entity's owner team tag will be injected as `{{teamTag}}` in blueprint generation
- The entity's system/domain will be available for naming conventions
- Resource existence checks will verify no duplicate infrastructure is being generated

### Playwright E2E Test Suite

- `app-config.e2e.yaml` with controlled blueprint fixture data
- Playwright scenarios covering `generated`, `validation_failed`, `blueprint_unavailable`, Scaffolder action dry-run, and replay recovery
- Screenshot review of generated file list and findings panels

### Production Dashboards

- Usage dashboards tracking generation volume by provider, status distribution, validation-failure rate, and self-correction rate
- Token-usage and latency monitoring for future AI-powered generation
